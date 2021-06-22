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
  const finalString = opts.bemNesting ?
    generateBEM(classSet, opts) :
    generateFlat(classSet, opts);

  if (opts.destination === 'clipboard') {
    pasteToClipboard(finalString);
  } else {
    pasteToNewDoc(finalString);
  }
}

function tryParseRegex(regStr) {
  try {
    return new RegExp(regStr);
  }
  catch(e) {
    return null;
  }
}

function getOptionts(override = {}) {
  const config = vscode.workspace.getConfiguration('ecsstractor-port');

  const options = {
    indentation: config.get('indentation'),
    commentStyle: config.get('commentStyle'),
    brackets: config.get('brackets'),
    bracketsNewLineAfter: config.get('bracketsNewLineAfter'),
    emptyLineBeforeSelector: config.get('emptyLineBeforeSelector'),
    destination: config.get('destination'),
    attributes: config.get('attributes'),
    ignore: config.get('ignore'),
    ignoreRegex: config.get('ignoreRegex').map(tryParseRegex).filter(Boolean),

    bemNesting: config.get('bemNesting.enable'),
    parentSymbol: config.get('bemNesting.parentSymbol'),
    elementSeparator: config.get('bemNesting.elementSeparator'),
    modifierSeparator: config.get('bemNesting.modifierSeparator'),
    addComment: config.get('bemNesting.addComment'),
  };

  return { ...options, ...override };
}

function activate(context) {
  const run = vscode.commands.registerCommand('ecsstractor-port.run', () => {
    const options = getOptionts();
    process(options);
  });

  const runWithBem = vscode.commands.registerCommand('ecsstractor-port.runwithbem', () => {
    const override = {
      addComment: false,
      // brackets: true,
      bemNesting: true,
    };

    const options = getOptionts(override);
    process(options);
  });

  const runWithBemAndComments = vscode.commands.registerCommand('ecsstractor-port.runwithbemandcomments', () => {
    const override = {
      addComment: true,
      // brackets: true,
      bemNesting: true,
    };

    const options = getOptionts(override);
    process(options);
  });

  const runWithoutBem = vscode.commands.registerCommand('ecsstractor-port.runwithoutbem', () => {
    const override = {
      addComment: false,
      // brackets: false,
      bemNesting: false,
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

  if (opts.emptyLineBeforeSelector) {
    output.push(new TextLine('', 0, false));
  }

  if (comment) {
    const isSCSS = opts.commentStyle === 'scss';
    const commentOpen = isSCSS ? '// ' : '/* ';
    const commentClose = isSCSS ? '' : ' */';

    const text = commentOpen + comment + commentClose;
    output.push(new TextLine(text));
  }

  const bracketOpen = opts.brackets ? ' {' : '';
  const bracketClose = opts.brackets ? '}' : '';

  if (children.length === 0) {
    if (opts.bracketsNewLineAfter) {
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
    elementSeparator,
    modifierSeparator,
    parentSymbol,
    addComment
  } = opts;

  const blocksMap = new Map();

  // build map
  for (const selector of classesSet) {
    const isElement = selector.includes(elementSeparator);

    if (isElement) {
      const [bName, elRest] = selector.split(elementSeparator);

      if (opts.ignore.includes(bName)) continue;
      if (opts.ignoreRegex.some(r => r.test(bName))) continue;

      const isExistBlock = blocksMap.has(bName);
      const block = isExistBlock ? blocksMap.get(bName) : { name: bName, elements: new Map(), modifiers: new Set() };

      if (!isExistBlock) blocksMap.set(bName, block);

      // get element and its modifier
      const [elName, elMod] = elRest.split(modifierSeparator);

      const isExistElement = block.elements.has(elName);
      const element = isExistElement ? block.elements.get(elName) : { name: elName, modifiers: new Set() };

      if (!isExistElement) block.elements.set(elName, element);

      if (elMod) {
        element.modifiers.add(elMod);
      }

    } else {
      const [bName, bMod] = selector.split(modifierSeparator);
      
      if (opts.ignore.includes(bName)) continue;
      if (opts.ignoreRegex.some(r => r.test(bName))) continue;

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
      const comment = addComment ? '.' + block.name + modifierSeparator + modifier : '';
      const lines = buildRuleLines(parentSymbol + modifierSeparator + modifier, comment, [], opts);
      blockMods.push(...lines);
    }

    for (const element of block.elements.values()) {
      const elMods = [];

      for (const modifier of element.modifiers) {
        const comment = addComment ? '.' + block.name + elementSeparator + element.name + modifierSeparator + modifier : '';
        const lines = buildRuleLines(parentSymbol + modifierSeparator + modifier, comment, [], opts);
        elMods.push(...lines);
      }

      const comment = addComment ? '.' + block.name + elementSeparator + element.name : '';
      const lines = buildRuleLines(parentSymbol + elementSeparator + element.name, comment, elMods, opts);
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

    if (opts.ignore.includes(className)) continue;
    if (opts.ignoreRegex.some(r => r.test(className))) continue;

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