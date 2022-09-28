RunMe Examples
==============

This `README.md` contains some example for testing this extension.

# Extension Example Markdown Files

This markdown file contains some custom examples to test the execution within a VS Code Notebook.

## Shell Executions

```sh
echo "Hello World"
```

```sh
echo "Foo 👀"
sleep 2
echo "Bar 🕺"
sleep 2
echo "Loo 🚀"
```

## Complexer Output

```sh
yarn global add webdriverio
```

## Stdin Example

```
node ./stdin.js
```

## Web Component Example

Examples of Webcomponents rendered within cells.

```html
<div>
  <h1>Shell Output Component</h1>
  <shell-output>
    foo 😉
    bar 👀
  </shell-output>
</div>
<div>
  <h1>Vercel Output Component</h1>
  <vercel-output content='{"payload": { "name": "foobar", "createdAt": 1664321974484, "status": "demoing" } }' />
</div>
```
