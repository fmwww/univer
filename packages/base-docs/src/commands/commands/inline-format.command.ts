import { ITextSelectionRangeWithStyle } from '@univerjs/base-render';
import {
    BooleanNumber,
    CommandType,
    getTextIndexByCursor,
    ICommand,
    ICommandInfo,
    ICommandService,
    IDocumentBody,
    IStyleBase,
    ITextDecoration,
    ITextRun,
    IUndoRedoService,
    IUniverInstanceService,
} from '@univerjs/core';

import MemoryCursor from '../../Basics/memoryCursor';
import { TextSelectionManagerService } from '../../services/text-selection-manager.service';
import { IRichTextEditingMutationParams, RichTextEditingMutation } from '../mutations/core-editing.mutation';

export interface ISetInlineFormatCommandParams {
    segmentId: string;
    preCommandId: string;
    value?: string;
}

export const SetInlineFormatBoldCommand: ICommand = {
    id: 'doc.command.set-inline-format-bold',
    type: CommandType.COMMAND,
    handler: async () => true,
};

export const SetInlineFormatItalicCommand: ICommand = {
    id: 'doc.command.set-inline-format-italic',
    type: CommandType.COMMAND,
    handler: async () => true,
};

export const SetInlineFormatUnderlineCommand: ICommand = {
    id: 'doc.command.set-inline-format-underline',
    type: CommandType.COMMAND,
    handler: async () => true,
};

export const SetInlineFormatStrikethroughCommand: ICommand = {
    id: 'doc.command.set-inline-format-strikethrough',
    type: CommandType.COMMAND,
    handler: async () => true,
};

export const SetInlineFormatFontSizeCommand: ICommand = {
    id: 'doc.command.set-inline-format-fontsize',
    type: CommandType.COMMAND,
    handler: async () => true,
};

export const SetInlineFormatFontFamilyCommand: ICommand = {
    id: 'doc.command.set-inline-format-font-family',
    type: CommandType.COMMAND,
    handler: async () => true,
};

export const SetInlineFormatTextColorCommand: ICommand = {
    id: 'doc.command.set-inline-format-text-color',
    type: CommandType.COMMAND,
    handler: async () => true,
};

export const SetInlineFormatCommand: ICommand<ISetInlineFormatCommandParams> = {
    id: 'doc.command.set-inline-format',
    type: CommandType.COMMAND,
    handler: async (accessor, params: ISetInlineFormatCommandParams) => {
        const { segmentId, value, preCommandId } = params;
        const undoRedoService = accessor.get(IUndoRedoService);
        const commandService = accessor.get(ICommandService);
        const textSelectionManagerService = accessor.get(TextSelectionManagerService);
        const currentUniverService = accessor.get(IUniverInstanceService);

        const selections = textSelectionManagerService.getSelections();

        if (!Array.isArray(selections) || selections.length === 0) {
            return false;
        }

        const docsModel = currentUniverService.getCurrentUniverDocInstance();
        const unitId = docsModel.getUnitId();

        let formatValue;

        const COMMAND_ID_TO_FORMAT_KEY_MAP: Record<string, keyof IStyleBase> = {
            [SetInlineFormatBoldCommand.id]: 'bl',
            [SetInlineFormatItalicCommand.id]: 'it',
            [SetInlineFormatUnderlineCommand.id]: 'ul',
            [SetInlineFormatStrikethroughCommand.id]: 'st',
            [SetInlineFormatFontSizeCommand.id]: 'fs',
            [SetInlineFormatFontFamilyCommand.id]: 'ff',
            [SetInlineFormatTextColorCommand.id]: 'cl',
        };

        switch (preCommandId) {
            case SetInlineFormatBoldCommand.id: // fallthrough
            case SetInlineFormatItalicCommand.id: // fallthrough
            case SetInlineFormatUnderlineCommand.id: // fallthrough
            case SetInlineFormatStrikethroughCommand.id: {
                formatValue = getReverseFormatValueInSelection(
                    docsModel.body!.textRuns!,
                    COMMAND_ID_TO_FORMAT_KEY_MAP[preCommandId],
                    selections
                );

                break;
            }

            case SetInlineFormatFontSizeCommand.id:
            case SetInlineFormatFontFamilyCommand.id: {
                formatValue = value;
                break;
            }

            case SetInlineFormatTextColorCommand.id: {
                formatValue = {
                    rgb: value,
                };
                break;
            }

            default: {
                throw new Error(`Unknown command: ${preCommandId} in handleInlineFormat`);
            }
        }

        const doMutation: ICommandInfo<IRichTextEditingMutationParams> = {
            id: RichTextEditingMutation.id,
            params: {
                unitId,
                mutations: [],
            },
        };

        const memoryCursor = new MemoryCursor();

        memoryCursor.reset();

        for (const selection of selections) {
            const { cursorStart, cursorEnd, isStartBack, isEndBack } = selection;
            const textStart = getTextIndexByCursor(cursorStart, isStartBack);
            const textEnd = getTextIndexByCursor(cursorEnd, isEndBack);

            const body: IDocumentBody = {
                dataStream: '',
                textRuns: [
                    {
                        st: 0,
                        ed: textEnd - textStart,
                        ts: {
                            [COMMAND_ID_TO_FORMAT_KEY_MAP[preCommandId]]: formatValue,
                        },
                    },
                ],
            };

            const len = textStart + 1 - memoryCursor.cursor;
            if (len !== 0) {
                doMutation.params!.mutations.push({
                    t: 'r',
                    len,
                    segmentId,
                });
            }

            doMutation.params!.mutations.push({
                t: 'r',
                body,
                len: textEnd - textStart,
                segmentId,
            });

            memoryCursor.reset();
            memoryCursor.moveCursor(textEnd + 1);
        }

        const result = commandService.syncExecuteCommand<
            IRichTextEditingMutationParams,
            IRichTextEditingMutationParams
        >(doMutation.id, doMutation.params);

        if (result) {
            undoRedoService.pushUndoRedo({
                unitID: unitId,
                undo() {
                    return commandService.syncExecuteCommand(RichTextEditingMutation.id, result);
                },
                redo() {
                    return commandService.syncExecuteCommand(doMutation.id, doMutation.params);
                },
            });

            return true;
        }

        return false;
    },
};

function isTextDecoration(value: unknown | ITextDecoration): value is ITextDecoration {
    return value !== null && typeof value === 'object';
}

/**
 * When clicking on a Bold menu item, you should un-bold if there is bold in the selections,
 * or bold if there is no bold text. This method is used to get the reverse style value calculated
 * from textRuns in the selection
 */
function getReverseFormatValueInSelection(
    textRuns: ITextRun[],
    key: keyof IStyleBase,
    selections: ITextSelectionRangeWithStyle[]
): BooleanNumber | ITextDecoration {
    let ti = 0;
    let si = 0;

    while (ti !== textRuns.length && si !== selections.length) {
        const { cursorStart, cursorEnd, isStartBack, isEndBack } = selections[si];

        const textStart = getTextIndexByCursor(cursorStart, isStartBack) + 1;
        const textEnd = getTextIndexByCursor(cursorEnd, isEndBack) + 1;

        // TODO: @jocs handle sid in textRun
        const { st, ed, ts } = textRuns[ti];

        if (textEnd <= st) {
            si++;
        } else if (ed <= textStart) {
            ti++;
        } else {
            if (ts?.[key] == null) {
                return /bl|it/.test(key)
                    ? BooleanNumber.TRUE
                    : {
                          s: BooleanNumber.TRUE,
                      };
            }

            if (ts[key] === BooleanNumber.FALSE) {
                return BooleanNumber.TRUE;
            }

            if (isTextDecoration(ts[key]) && (ts[key] as ITextDecoration).s === BooleanNumber.FALSE) {
                return {
                    s: BooleanNumber.TRUE,
                };
            }

            ti++;
        }
    }

    return /bl|it/.test(key)
        ? BooleanNumber.FALSE
        : {
              s: BooleanNumber.FALSE,
          };
}