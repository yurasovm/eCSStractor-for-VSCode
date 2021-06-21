const vscode = require('vscode');
const htmlparser2 = require('htmlparser2');

function pasteToClipboard(text) {
  vscode.env.clipboard.writeText(text)
    .then(() => vscode.window.showInformationMessage('Copied CSS format to clipboard'))
    .catch((err) => vscode.window.showErrorMessage(err));
}

function pasteToNewDoc(text) {
  vscode.workspace.openTextDocument()
    .then((newDoc) => {
      return vscode.window.showTextDocument(newDoc, 1, false)
        .then((editor) => {
          return editor.edit((editBuilder) => {
            editBuilder.insert(new vscode.Position(0, 0), text);
          });
        });
    });
}

function parseHtmlClasses(text, opts) {
  const classSet = new Set();

  const tagClassHadler = (name, attribs) => {
    if (!attribs.class) return;

    attribs.class.split(/\s+/)
      .forEach(cl => cl && classSet.add(cl));
  };

  const tagClassNameHadler = (name, attribs) => {
    if (!attribs.classname) return;

    attribs.classname.split(/\s+/)
      .forEach(cl => cl && classSet.add(cl));
  };

  const tagClassAndNameHadler = (name, attribs) => {
    tagClassHadler(name, attribs);
    tagClassNameHadler(name, attribs);
  };

  let onOpentagHandler = tagClassHadler;
  switch (opts.attributes) {
    case 'class':
      onOpentagHandler = tagClassHadler;
      break;
    case 'className':
      onOpentagHandler = tagClassNameHadler;
      break;
    case 'classAndClassName':
      onOpentagHandler = tagClassAndNameHadler;
      break;
  }

  const parser = new htmlparser2.Parser({ onopentag: onOpentagHandler }, { lowerCaseAttributeNames: true });
  parser.write(text);
  parser.end();

  return classSet;
}

function process(opts) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }

  const selectedText = editor.selection.isEmpty ?
    editor.document.getText() :
    editor.document.getText(editor.selection);

  const classSet = parseHtmlClasses(selectedText, opts);
  const finalString = opts.bem_nesting ?
    generateBEM(classSet, opts) :
    generateFlat(classSet, opts);

  if (opts.destination === 'clipboard') {
    pasteToClipboard(finalString);
  } else {
    pasteToNewDoc(finalString);
  }
}

function getOptionts(override = {}) {
  const config = vscode.workspace.getConfiguration('ecsstractor_port');
  const options = {
    indentation: config.get('indentation'),
    element_separator: config.get('element_separator'),
    modifier_separator: config.get('modifier_separator'),
    parent_symbol: config.get('parent_symbol'),
    empty_line_before_nested_selector: config.get('empty_line_before_nested_selector'),
    add_comments: config.get('add_comment'),
    comment_style: config.get('comment_style'),
    brackets: config.get('brackets'),
    brackets_newline_after: config.get('brackets_newline_after'),
    destination: config.get('destination'),
    bem_nesting: config.get('bem_nesting'),
    attributes: config.get('attributes'),
  };

  return { ...options, ...override };
}

function activate(context) {
  const run = vscode.commands.registerCommand('extension.ecsstractor_port_run', () => {
    const options = getOptionts();
    process(options);
  });

  const runWithBem = vscode.commands.registerCommand('extension.ecsstractor_port_runwithbem', () => {
    const override = {
      add_comments: false,
      // brackets: true,
      bem_nesting: true,
    };

    const options = getOptionts(override);
    process(options);
  });

  const runWithBemAndComments = vscode.commands.registerCommand('extension.ecsstractor_port_runwithbemandcomments', () => {
    const override = {
      add_comments: true,
      // brackets: true,
      bem_nesting: true,
    };

    const options = getOptionts(override);
    process(options);
  });

  const runWithoutBem = vscode.commands.registerCommand('extension.ecsstractor_port_runwithoutbem', () => {
    const override = {
      add_comments: false,
      // brackets: false,
      bem_nesting: false,
    };

    const options = getOptionts(override);
    process(options);
  });

  context.subscriptions.push(run);
  context.subscriptions.push(runWithBem);
  context.subscriptions.push(runWithBemAndComments);
  context.subscriptions.push(runWithoutBem);
}

class TextLine {
  constructor(text = '', level = 0, autoindent = true) {
    this.text = text;
    this.level = level;
    this.autoindent = autoindent;
  }

  incIndent(inc = 1) {
    const level = this.autoindent ? this.level + inc : this.level;
    return new TextLine(this.text, level, this.autoindent);
  }

  getString(indentation = '') {
    return indentation.repeat(this.level) + this.text;
  }
}

function buildRuleLines(selector, comment, children = [], opts = {}) {
  const output = [];

  if (opts.empty_line_before_nested_selector) {
    output.push(new TextLine('', 0, false));
  }

  if (comment) {
    const isSCSS = opts.comment_style === 'scss';
    const commentOpen = isSCSS ? '// ' : '/* ';
    const commentClose = isSCSS ? '' : ' */';

    const text = commentOpen + comment + commentClose;
    output.push(new TextLine(text));
  }

  const bracketOpen = opts.brackets ? ' {' : '';
  const bracketClose = opts.brackets ? '}' : '';

  if (children.length === 0) {
    if (opts.brackets_newline_after) {
      output.push(new TextLine(selector + bracketOpen));
      output.push(new TextLine(bracketClose));
    } else {
      output.push(new TextLine(selector + bracketOpen + bracketClose));
    }
  } else {
    output.push(new TextLine(selector + bracketOpen));
    children.forEach(s => output.push(s.incIndent()));
    output.push(new TextLine(bracketClose));
  }

  return output;
}

function generateBEM(classesSet, opts) {
  const {
    indentation,
    element_separator,
    modifier_separator,
    parent_symbol,
    add_comments
  } = opts;

  const blocksMap = new Map();

  // build map
  for (const selector of classesSet) {
    const isElement = selector.includes(element_separator);

    if (isElement) {
      const [bName, elRest] = selector.split(element_separator);

      const isExistBlock = blocksMap.has(bName);
      const block = isExistBlock ? blocksMap.get(bName) : { name: bName, elements: new Map(), modifiers: new Set() };

      if (!isExistBlock) blocksMap.set(bName, block);

      // get element and its modifier
      const [elName, elMod] = elRest.split(modifier_separator);

      const isExistElement = block.elements.has(elName);
      const element = isExistElement ? block.elements.get(elName) : { name: elName, modifiers: new Set() };

      if (!isExistElement) block.elements.set(elName, element);

      if (elMod) {
        element.modifiers.add(elMod);
      }

    } else {
      const [bName, bMod] = selector.split(modifier_separator);

      const isExistBlock = blocksMap.has(bName);
      const block = isExistBlock ? blocksMap.get(bName) : { name: bName, elements: new Map(), modifiers: new Set() };

      if (!isExistBlock) blocksMap.set(bName, block);

      if (bMod) {
        block.modifiers.add(bMod);
      }
    }
  }

  const indentedStrings = [];
  for (const block of blocksMap.values()) {
    const blockMods = [];
    const blockEls = [];

    for (const modifier of block.modifiers) {
      const comment = add_comments ? '.' + block.name + modifier_separator + modifier : '';
      const lines = buildRuleLines(parent_symbol + modifier_separator + modifier, comment, [], opts);
      blockMods.push(...lines);
    }

    for (const element of block.elements.values()) {
      const elMods = [];

      for (const modifier of element.modifiers) {
        const comment = add_comments ? '.' + block.name + element_separator + element.name + modifier_separator + modifier : '';
        const lines = buildRuleLines(parent_symbol + modifier_separator + modifier, comment, [], opts);
        elMods.push(...lines);
      }

      const comment = add_comments ? '.' + block.name + element_separator + element.name : '';
      const lines = buildRuleLines(parent_symbol + element_separator + element.name, comment, elMods, opts);
      blockEls.push(...lines);
    }

    const comment = '';
    const lines = buildRuleLines('.' + block.name, comment, [...blockMods, ...blockEls], opts);
    indentedStrings.push(...lines);
  }

  return indentedStrings
    .map(s => s.getString(indentation))
    .join('\n');
}

function generateFlat(classesSet, opts) {
  const indentation = opts.indentation;
  const indentedStrings = [];

  for (const className of classesSet) {
    const lines = buildRuleLines('.' + className, null, [], opts);
    indentedStrings.push(...lines);
  }

  return indentedStrings
    .map(s => s.getString(indentation))
    .join('\n');
}

exports.activate = activate;

// this method is called when your extension is deactivated
function deactivate() {}
exports.deactivate = deactivate;