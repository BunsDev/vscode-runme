import { NotebookData, NotebookDocument, NotebookEdit, window, workspace } from 'vscode'
import { expect, vi, it, describe, beforeEach } from 'vitest'

import { GrpcSerializer, SerializerBase, WasmSerializer } from '../../src/extension/serializer'
import type { Kernel } from '../../src/extension/kernel'
import { EventEmitter, Uri } from '../../__mocks__/vscode'
import { Serializer } from '../../src/types'

import fixtureMarshalNotebook from './fixtures/marshalNotebook.json'

globalThis.Go = vi.fn()
globalThis.Runme = { serialize: vi.fn().mockResolvedValue('Hello World!') }

vi.mock('../../src/extension/grpc/client', () => ({
  ParserServiceClient: vi.fn(),
}))

vi.mock('vscode', () => ({
  window: {
    activeNotebookEditor: undefined,
    showErrorMessage: vi.fn().mockResolvedValue({}),
  },
  Uri: { joinPath: vi.fn().mockReturnValue('/foo/bar') },
  workspace: {
    fs: { readFile: vi.fn().mockResolvedValue({}) },
    onDidChangeNotebookDocument: vi.fn().mockReturnValue({ dispose: vi.fn() }),
    onDidSaveNotebookDocument: vi.fn().mockReturnValue({ dispose: vi.fn() }),
    applyEdit: vi.fn(),
    getConfiguration: vi.fn().mockReturnValue({
      update: vi.fn(),
      get: vi.fn(),
    }),
    notebookDocuments: [],
  },
  commands: { executeCommand: vi.fn() },
  WorkspaceEdit: Map<Uri, NotebookEdit[]>,
  NotebookEdit: {
    updateCellMetadata: (i: number, metadata: any) => ({ i, metadata, type: 'updateCellMetadata' }),
  },
  CancellationTokenSource: vi.fn(),
  NotebookData: class {
    constructor(public cells: any[]) {}
  },
}))

vi.mock('../../src/extension/languages', () => ({
  default: {
    fromContext: vi.fn(),
  },
  NotebookData: class {},
}))

vi.mock('../../src/extension/utils', () => ({
  initWasm: vi.fn(),
}))

function newKernel(): Kernel {
  return {} as unknown as Kernel
}

describe('SerializerBase', () => {
  const context: any = {
    extensionUri: { fsPath: '/foo/bar' },
  }

  it('serializeNotebook transforms languages', async () => {
    const TestSerializer = class extends SerializerBase {
      protected ready: Promise<void | Error> = Promise.resolve()

      protected async saveNotebook(data: NotebookData): Promise<Uint8Array> {
        return data as any
      }

      protected async reviveNotebook(content: Uint8Array): Promise<Serializer.Notebook> {
        return content as any
      }

      protected async preSaveCheck() {}
    }

    const serializer = new TestSerializer({} as any, {} as any)

    const processed = (await serializer['serializeNotebook'](
      {
        cells: [
          {
            languageId: 'shellscript',
          },
          {
            languageId: 'javascriptreact',
          },
          {
            languageId: 'typescriptreact',
          },
          {
            languageId: 'python',
          },
        ],
      } as any,
      {} as any,
    )) as any

    expect(processed.cells).toStrictEqual([
      {
        languageId: 'sh',
      },
      {
        languageId: 'jsx',
      },
      {
        languageId: 'tsx',
      },
      {
        languageId: 'python',
      },
    ])
  })

  describe('handleNotebookSaved', () => {
    const _onDidSaveNotebookDocument = new EventEmitter<NotebookDocument>()

    beforeEach(() => {
      vi.mocked(workspace.onDidSaveNotebookDocument).mockImplementation((l) =>
        _onDidSaveNotebookDocument.event(l),
      )

      vi.mocked(workspace.applyEdit).mockClear()
    })

    it('updates cell names on save', async () => {
      const s = new WasmSerializer(context, newKernel())

      s['deserializeNotebook'] = vi.fn(
        () =>
          ({
            cells: [
              {
                metadata: {
                  'runme.dev/name': 'newName',
                  interactive: true,
                },
              },
            ],
          }) as any,
      )

      const uri = Uri.file('/foo/bar')

      await _onDidSaveNotebookDocument.fireAsync({
        uri,
        cellAt: () => ({ metadata: { 'runme.dev/name': 'oldName', interactive: false } }),
      } as any)

      expect(workspace.applyEdit).toHaveBeenCalledTimes(0)

      // const edit = vi.mocked(workspace.applyEdit).mock.calls[0][0]
      // expect(edit).toBeTruthy()

      // const edits = edit.get(uri)
      // expect(edits).toHaveLength(1)

      // expect(edits[0]).toStrictEqual({
      //   i: 0,
      //   type: 'updateCellMetadata',
      //   metadata: {
      //     interactive: false,
      //     'runme.dev/name': 'newName',
      //   }
      // })
    })
  })
})

describe('WasmSerializer', () => {
  const context: any = {
    extensionUri: { fsPath: '/foo/bar' },
  }

  describe('serializeNotebook', () => {
    it('uses Runme wasm to save the file', async () => {
      // @ts-ignore readonly
      window.activeNotebookEditor = {} as any
      const s = new WasmSerializer(context, newKernel())
      // @ts-ignore readonly
      s['ready'] = Promise.resolve()
      expect(Buffer.from(await s.serializeNotebook({ cells: [] } as any, {} as any))).toEqual(
        Buffer.from('Hello World!'),
      )
    })
  })
})

describe('GrpcSerializer', () => {
  const deepCopyFixture = () => {
    const raw = fixtureMarshalNotebook as any
    return JSON.parse(JSON.stringify(raw))
  }

  describe('cell execution summary marshaling', () => {
    it('should not misrepresenting uninitialized values', () => {
      // i.e. undefined is not sucess=false
      const execSummaryFixture = deepCopyFixture()
      expect(execSummaryFixture.cells.length).toBe(2)

      // set here since JSON does not represent "undefined" as vscode APIs do
      execSummaryFixture.cells[0].executionSummary = {
        success: undefined,
        timing: { startTime: undefined, endTime: undefined },
      }

      const notebookData = GrpcSerializer.marshalNotebook(execSummaryFixture)
      expect(notebookData.cells.length).toBe(2)
      expect(notebookData.cells[0].executionSummary).toBeUndefined()
    })

    it('should wrap raw values for protobuf', () => {
      const execSummaryFixture = deepCopyFixture()
      expect(execSummaryFixture.cells.length).toBe(2)

      const notebookData = GrpcSerializer.marshalNotebook(execSummaryFixture)
      expect(notebookData.cells.length).toBe(2)

      const summary = notebookData.cells[1].executionSummary
      expect(summary?.success).toBeDefined()
      expect(summary?.success?.value).toStrictEqual(false)

      expect(summary?.timing).toBeDefined()
      expect(summary?.timing?.startTime?.value).toStrictEqual('1701444499517')
      expect(summary?.timing?.endTime?.value).toStrictEqual('1701444501696')
    })
  })

  describe('cell outputs marshaling', () => {
    it('should backfill the output type for buffers', () => {
      const outputsFixture = deepCopyFixture()
      expect(outputsFixture.cells.length).toBe(2)

      const notebookData = GrpcSerializer.marshalNotebook(outputsFixture)
      expect(notebookData.cells.length).toBe(2)
      const cells = notebookData.cells[1]
      const items = cells.outputs[0].items
      expect(items.length).toBe(2)
      items.forEach((item) => {
        expect((item.data as any).type).toBe('Buffer')
        expect(item.mime).toBeDefined()
      })
      const { processInfo } = cells.outputs[0]
      expect(processInfo?.exitReason).toBeDefined()
      expect(processInfo?.exitReason?.type).toStrictEqual('exit')
      expect(processInfo?.exitReason?.code?.value).toStrictEqual(16)
      expect(processInfo?.pid).toBeDefined()
      expect(processInfo?.pid?.value).toStrictEqual('98354')
    })
  })
})
