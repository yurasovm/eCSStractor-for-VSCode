# eCSStractor for VSCode README

VSCode plugin for extracting class names from HTML and generate CSS stylesheet for following work.

![eCSStractor](https://user-images.githubusercontent.com/3763808/48542328-b0b88080-e8e0-11e8-9702-5258651a491e.gif)

# Usage
Open any document contain HTML and do one of the following:

- Press **Cmd+Shift+P** on Mac OS X or **Ctrl+Shift+P** on Windows/Linux to launch command palette and choose:
	- eCSStractor Run
	- eCSStractor Run (With BEM Nesting)
	- eCSStractor Run (With BEM Nesting and comments)
	- eCSStractor Run (Without BEM Nesting)
- Right click and select eCSStractor Run

Then you will see new tab with CSS selectors extracted from document or copy them to the clipboard (depending on settings).

Plugin can process either selected text or whole file.

# Settings

- **Brackets** - Add brackets. Useful for Sass syntax and Stylus
- **Brackets newline after** - Add new line
- **Destination** - Where to put result ("tab" or "clipboard")
- **Bem nesting** - BEM Nesting. Generate nested stylesheet for preprocessors
- **Indentation** - Indent symbol
- **Element separator** - Separator between block and element names
- **Modifier separator** - Separator between block or element and they modifier
- **Parent symbol** - Parent symbol. Ex.: &__element {}
- **Empty line before nested selector** - Empty line before nested element/modifier
- **Add comment** - Add comments to nested stylesheets for preprocessors
- **Comment style** - Comment style. Either CSS (/* */) or SCSS (//)

# Notes
- Port from [eCSStractor for Sublime Text](https://packagecontrol.io/packages/eCSStractor)
- Extencion icon from [iconfinder.com](https://www.iconfinder.com/icons/2308969/css_document_file_format_type_icon)