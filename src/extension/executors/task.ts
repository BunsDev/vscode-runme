import path from 'node:path'
import { writeFile, chmod } from 'node:fs/promises'

import {
  Task, ShellExecution, TextDocument, NotebookCellExecution, TaskScope, tasks,
  window, TerminalOptions, commands, ExtensionContext
} from 'vscode'
import { file } from 'tmp-promise'

const LABEL_LIMIT = 15

export function closeTerminalByScript (script: string) {
  const terminal = window.terminals.find((t) => (
    t.creationOptions as TerminalOptions).shellArgs?.includes(script))
  if (terminal) {
    terminal.hide()
  }
}

async function taskExecutor(
  context: ExtensionContext,
  exec: NotebookCellExecution,
  doc: TextDocument,
): Promise<boolean> {
  const scriptFile = await file()
  const cellText = doc.getText()
  await writeFile(scriptFile.path, cellText, 'utf-8')
  await chmod(scriptFile.path, 0o775)

  const taskExecution = new Task(
    { type: 'runme', name: 'Runme Task' },
    TaskScope.Workspace,
    cellText.length > LABEL_LIMIT
      ? `${cellText.slice(0, LABEL_LIMIT)}...`
      : cellText,
    'exec',
    new ShellExecution(scriptFile.path, {
      cwd: path.dirname(doc.uri.path)
    })
  )
  await commands.executeCommand('workbench.action.terminal.clear')
  const execution = await tasks.executeTask(taskExecution)

  return !Boolean(await new Promise<number>((resolve) => {
    exec.token.onCancellationRequested(() => {
      try {
        execution.terminate()
        closeTerminalByScript(scriptFile.path)
        resolve(0)
      } catch (err: any) {
        console.error(`[Runme] Failed to terminate task: ${(err as Error).message}`)
        resolve(1)
      }
    })

    tasks.onDidEndTaskProcess((e) => {
      const taskId = (e.execution as any)['_id']
      const executionId = (execution as any)['_id']

      /**
       * ignore if
       */
      if (
        /**
         * VS Code is running a different task
         */
        taskId !== executionId ||
        /**
         * we don't have an exit code
         */
        typeof e.exitCode === 'undefined'
      ) {
        return
      }

      closeTerminalByScript(scriptFile.path)
      return resolve(e.exitCode)
    })
  }))
}

export const sh = taskExecutor
export const bash = taskExecutor