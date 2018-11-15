// 'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
// Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require('vscode');
const htmlparser = require("htmlparser2");
const ncp = require("copy-paste");

var config;
var brackets;
var brackets_newline_after;
var destination;
var add_comments;
var bem_nesting;

function processEl(list) {
	var finalList = [];
	function recursiveAdd(el) {
		if (el.type === 'tag') {
			finalList.push(el);
			if (typeof el.children !== 'undefined' && el.children.length > 0) {
				el.children.forEach(childEl => {
					recursiveAdd(childEl);
				});
			}
		}
	}
	// Start recursion
	list.forEach(element => {
		recursiveAdd(element);
	});
	return finalList;
}

function process() {
	var editor = vscode.window.activeTextEditor;
	if (!editor) {
		return;
	}

	var selectedText = editor.document.getText(editor.selection);

	if ( selectedText.length == 0 ) {
		selectedText = editor.document.getText();
	}

	var parsedEls = htmlparser.parseDOM(selectedText);
	var processedEls = processEl(parsedEls);
	var outputClasses = [];

	processedEls.filter((el) => {
		return typeof el.attribs.class !== 'undefined' && el.attribs.class.trim() !== '';
	}).forEach(el => {
		var cssClasses = el.attribs.class.split(' ').filter(className => className.trim() !== '');
		cssClasses.forEach(cssClass => {
			if (outputClasses.indexOf(cssClass) === -1) {
				outputClasses.push(cssClass);
			}
		});
	});

	if ( bem_nesting ) {
		var finalString = generateBEM( outputClasses, add_comments );
	} else {
		// Format and combine string for output
		var finalString = outputClasses.reduce((outputClassText, classToAdd) => {
			var open_bracket = '';
			var close_bracket = '';

			if ( brackets ) {
				var open_bracket = '{';
				var close_bracket = '}';
			}

			if ( !brackets_newline_after ) {
				var cleanString = `.${classToAdd} ${open_bracket}${close_bracket}`;
			} else {
				var cleanString = `.${classToAdd} ${open_bracket}\n${close_bracket}`;
			}
			return outputClassText + (outputClassText !== '' ? '\n' : '') + cleanString;
		}, '');
	}

	if ( destination == 'clipboard' ) {
		ncp.copy(finalString, () => {
			vscode.window.showInformationMessage('Copied CSS format to clipboard');
		});
	} else {
		vscode.workspace.openTextDocument()
		.then((newDoc) => {
			return vscode.window.showTextDocument(newDoc, 1, false)
				.then((editor) => {
					return editor.edit((editBuilder) => {
						editBuilder.insert(new vscode.Position(0, 0), finalString );
					});
				});
		});
	}
}

function activate(context) {
	let run = vscode.commands.registerCommand('extension.ecsstractor_port_run', function () {
		config = vscode.workspace.getConfiguration('ecsstractor_port');
		add_comments = config.get('add_comment');
		brackets = config.get('brackets');
		brackets_newline_after = config.get('brackets_newline_after');
		destination = config.get('destination');
		bem_nesting = config.get('bem_nesting');

		process();
	});

	let runwithbem = vscode.commands.registerCommand('extension.ecsstractor_port_runwithbem', function () {
		config = vscode.workspace.getConfiguration('ecsstractor_port');
		add_comments = false;
		brackets = true;
		bem_nesting = true;
		brackets_newline_after = config.get('brackets_newline_after');
		destination = config.get('destination');

		process();
	});

	let runwithbemandcomments = vscode.commands.registerCommand('extension.ecsstractor_port_runwithbemandcomments', function () {
		config = vscode.workspace.getConfiguration('ecsstractor_port');
		add_comments = true;
		brackets = true;
		bem_nesting = true;
		brackets_newline_after = config.get('brackets_newline_after');
		destination = config.get('destination');

		process();
	});

	let runwithoutbem = vscode.commands.registerCommand('extension.ecsstractor_port_runwithoutbem', function () {
		config = vscode.workspace.getConfiguration('ecsstractor_port');
		add_comments = false;
		brackets = false;
		bem_nesting = false;
		brackets_newline_after = config.get('brackets_newline_after');
		destination = config.get('destination');

		process();
	});

	context.subscriptions.push(run);
	context.subscriptions.push(runwithbem);
	context.subscriptions.push(runwithbemandcomments);
	context.subscriptions.push(runwithoutbem);
}

function generateBEM( data, add_comments ) {
	var indentation = config.get('indentation');
	var element_separator = config.get('element_separator');
	var modifier_separator = config.get('modifier_separator');
	var parent_symbol = config.get('parent_symbol');
	var empty_line_before_nested_selector = config.get('empty_line_before_nested_selector');

	// Comment style
	var comment_style = config.get('comment_style');
	var comment_symbol_beginning = "/* ";
	var comment_symbol_end = " */";

	if ( comment_style == "scss" ) {
		var comment_symbol_beginning = "// ";
		var comment_symbol_end = "";
	}

	var output = "";
	var selectors = [];

	// build tree
	for (let i = 0; i < data.length; i++) {
		var selector = data[i];
		var block = {};
		var element = {};

		if ( selector.indexOf( element_separator ) != -1 ) {

			var parts = selector.split( element_separator );

			// check if block with this name exist already
			var hasBlock = selectors.findIndex(el => el.name == parts[0]);

			// if block is exist link to list
			if ( hasBlock > -1 )
				block = selectors[ hasBlock ];

			// if block is not exist give it name
			if ( hasBlock == -1 )
				block.name	= parts[0];

			// if elements list exist in block
			if ( !( 'elements' in block ) )
				block.elements = [];

			// get element and his modifier
			var elementParts = parts[1].split(modifier_separator);

			// check if element with this name exist in block already
			var hasElement = block.elements.findIndex(el => el.name == elementParts[0] );

			// if element is exist link to list
			if ( hasElement > -1 )
				element = block.elements[ hasElement ];

			// if element is not exist give it name
			if ( hasElement == -1 )
				element.name = elementParts[0];

			// if element has modifier
			if ( elementParts.length > 1 ) {
				// if modifiers list exist in element
				if ( !( 'modifiers' in element ) )
					element.modifiers = [];

				// add modifier
				element.modifiers.push( elementParts[1] );
			}

			// if it is new element add it to block
			if ( hasElement == -1 )
				block.elements.push(element);

			// if it is new block add it to list
			if ( hasBlock == -1 ) {
				selectors.push( block );
			}
		} else if ( selector.indexOf( modifier_separator ) != -1 ) {
			var parts = selector.split( modifier_separator );

			var hasBlock = selectors.findIndex(el => el.name == parts[0]);

			if ( hasBlock > -1 )
				block = selectors[ hasBlock ];

			if ( hasBlock == -1 )
				block.name = parts[0];

			if ( !( 'modifiers' in block ) )
				block.modifiers = [];

			// add modifier
			block.modifiers.push( parts[1] );

			if ( hasBlock == -1 )
				selectors.push( block );
		} else {
			var hasBlock = selectors.findIndex(el => el.name == selector);

			if ( hasBlock == -1 ) {
				block.name = selector;
				selectors.push( block );
			}
		}
	}

	// format output
	selectors.forEach( function ( block ) {
		if ( brackets ) {
			output += "." + block.name + " {\n";
		} else {
			output += "." + block.name + "\n";
		}

		var indent = indentation;
		var indent1 = indent + indent;
		var indent2 = indent + indent + indent;

		if ( empty_line_before_nested_selector ) {
			var empty_line = "\n";
		} else {
			var empty_line = "";
		}

		if ( ( 'modifiers' in block ) ) {
			block.modifiers.forEach( function ( modifier ) {
				if ( brackets ) {
					if ( brackets_newline_after ) {
						if ( add_comments )
							output += empty_line + indent1 + comment_symbol_beginning + "." + block.name + modifier_separator + modifier + comment_symbol_end + "\n";

						output += empty_line + indent1 + parent_symbol + modifier_separator + modifier + " {\n";
						output += indent1 + "}\n";
					} else {
						if ( add_comments )
							output += empty_line + indent1 + comment_symbol_beginning + "." + block.name + modifier_separator + modifier + comment_symbol_end + "\n";

							output += empty_line + indent1 + parent_symbol + modifier_separator + modifier + " {}\n";
					}
				} else {
					if ( add_comments )
						output += indent1 + comment_symbol_beginning + "." + block.name + modifier_separator + modifier + comment_symbol_end + "\n";

					output += indent1 + parent_symbol + modifier_separator + modifier + "\n";
					output += "\n";
				}
			});
		}

		if ( ( 'elements' in block ) ) {
			block.elements.forEach( function ( element ) {
				if ( brackets ) {
					if ( brackets_newline_after ) {
						if ( add_comments )
							output += empty_line + indent1 + comment_symbol_beginning + "." + block.name + element_separator + element.name + comment_symbol_end + "\n";

						output += empty_line + indent1 + parent_symbol + element_separator + element.name + " {\n";
					} else {
						if ( add_comments )
							output += empty_line + indent1 + comment_symbol_beginning + "." + block.name + element_separator + element.name + comment_symbol_end + "\n";

						output += empty_line + indent1 + parent_symbol + element_separator + element.name + " {";
					}
				} else {
					if ( add_comments )
						output += empty_line + indent1 + comment_symbol_beginning + "." + block.name + element_separator + element.name + comment_symbol_end + "\n";

					output += empty_line + indent1 + parent_symbol + element_separator + element.name + "\n";
				}

				if ( ( 'modifiers' in element ) ) {
					if (!brackets_newline_after )
						output += "\n";

					element.modifiers.forEach( function ( modifier ) {
						if ( brackets ) {
							if ( brackets_newline_after ) {
								if ( add_comments )
									output += empty_line + indent2 + comment_symbol_beginning + "." + block.name + element_separator + element.name + modifier_separator + modifier + comment_symbol_end + "\n";

								output += empty_line + indent2 + parent_symbol + modifier_separator + modifier + " {\n";
								output += indent2 + "}\n";
							} else {
								if ( add_comments )
									output += empty_line + indent2 + comment_symbol_beginning + "." + block.name + element_separator + element.name + modifier_separator + modifier + comment_symbol_end + "\n";

								output += empty_line + indent2 + parent_symbol + modifier_separator + modifier + " {}\n";
							}
						} else {
							if ( add_comments )
								output += empty_line + indent2 + comment_symbol_beginning + "." + block.name + element_separator + element.name + modifier_separator + modifier + comment_symbol_end + "\n";

							output += empty_line + indent2 + parent_symbol + modifier_separator + modifier + "\n";
							output += "\n";
						}
					});
				}

				if ( brackets ) {
					if ( brackets_newline_after ) {
						output += indent1 + "}\n";
					} else {
						if ( ( 'modifiers' in element ) ) {
							output += indent1 + "}\n";
						} else {
							output += "}\n";
						}
					}
				} else {
					output += "\n";
				}
			});
		}

		if ( brackets ) {
			output += "}\n";
		} else {
			output += "\n";
		}
	});

	if ( !brackets ) {
		output = output.replace("\n\n\n\n", "\n\n");
		output = output.replace("\n\n\n", "\n\n");
	}

	return output;
}

exports.activate = activate;

// this method is called when your extension is deactivated
function deactivate() {
}
exports.deactivate = deactivate;