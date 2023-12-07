import type { ICellData, IRange, Nullable } from '@univerjs/core';
import { CellValueType, Disposable, isNullCell, ObjectMatrix } from '@univerjs/core';
import { createIdentifier } from '@wendellhu/redi';

import type {
    IArrayFormulaRangeType,
    IFeatureDirtyRangeType,
    IRuntimeOtherUnitDataType,
    IRuntimeUnitDataType,
} from '../basics/common';
import { isInDirtyRange } from '../basics/dirty';
import { ErrorType } from '../basics/error-type';
import type { BaseAstNode } from '../engine/ast-node/base-ast-node';
import { ErrorValueObject } from '../engine/other-object/error-value-object';
import type { BaseReferenceObject, FunctionVariantType } from '../engine/reference-object/base-reference-object';
import type { ArrayValueObject } from '../engine/value-object/array-value-object';
import type { BaseValueObject, CalculateValueType } from '../engine/value-object/base-value-object';
import { IFormulaCurrentConfigService } from './current-data.service';

/**
 * IDLE: Idle phase of the formula engine.
 *
 * DEPENDENCY: Dependency calculation phase, where the formulas that need to be calculated are determined by the modified area,
 * as well as their dependencies. This outputs an array of formulas to execute.
 *
 * INTERPRETER：Formula execution phase, where the calculation of formulas begins.
 *
 */
export enum FormulaExecuteStageType {
    IDLE,
    START_DEPENDENCY,
    START_CALCULATION,
    CURRENTLY_CALCULATING,
    START_DEPENDENCY_ARRAY_FORMULA,
    START_CALCULATION_ARRAY_FORMULA,
    CURRENTLY_CALCULATING_ARRAY_FORMULA,
    CALCULATION_COMPLETED,
}

export enum FormulaExecutedStateType {
    INITIAL,
    STOP_EXECUTION,
    NOT_EXECUTED,
    SUCCESS,
}

export interface IAllRuntimeData {
    unitData: IRuntimeUnitDataType;
    arrayFormulaRange: IArrayFormulaRangeType;
    unitOtherData: IRuntimeOtherUnitDataType;
    functionsExecutedState: FormulaExecutedStateType;
    arrayFormulaCellData: IRuntimeUnitDataType;
    clearArrayFormulaCellData: IRuntimeUnitDataType;

    runtimeFeatureRange: { [featureId: string]: IFeatureDirtyRangeType };
    runtimeFeatureCellData: { [featureId: string]: IRuntimeUnitDataType };
}

export interface IExecutionInProgressParams {
    totalFormulasToCalculate: number;
    completedFormulasCount: number;

    totalArrayFormulasToCalculate: number;
    completedArrayFormulasCount: number;

    stage: FormulaExecuteStageType;
}

export interface IFormulaRuntimeService {
    currentRow: number;

    currentColumn: number;

    currentSubComponentId: string;

    currentUnitId: string;

    dispose(): void;

    reset(): void;

    setCurrent(row: number, column: number, sheetId: string, unitId: string): void;

    registerFunctionDefinitionPrivacyVar(lambdaId: string, lambdaVar: Map<string, Nullable<BaseAstNode>>): void;

    getFunctionDefinitionPrivacyVar(lambdaId: string): Nullable<Map<string, Nullable<BaseAstNode>>>;

    setRuntimeData(functionVariant: FunctionVariantType): void;

    getUnitData(): IRuntimeUnitDataType;

    getUnitArrayFormula(): IArrayFormulaRangeType;

    stopExecution(): void;

    setFormulaExecuteStage(type: FormulaExecuteStageType): void;

    isStopExecution(): boolean;

    getFormulaExecuteStage(): FormulaExecuteStageType;

    setRuntimeOtherData(formulaId: string, functionVariant: FunctionVariantType): void;

    getRuntimeOtherData(): IRuntimeOtherUnitDataType;

    getAllRuntimeData(): IAllRuntimeData;

    markedAsSuccessfullyExecuted(): void;

    markedAsNoFunctionsExecuted(): void;

    markedAsStopFunctionsExecuted(): void;

    markedAsInitialFunctionsExecuted(): void;

    setTotalFormulasToCalculate(value: number): void;

    getTotalFormulasToCalculate(): number;

    setCompletedFormulasCount(value: number): void;

    getCompletedFormulasCount(): number;

    getRuntimeState(): IExecutionInProgressParams;

    setTotalArrayFormulasToCalculate(value: number): void;

    getTotalArrayFormulasToCalculate(): number;

    setCompletedArrayFormulasCount(value: number): void;

    getCompletedArrayFormulasCount(): number;

    enableCycleDependency(): void;

    disableCycleDependency(): void;

    isCycleDependency(): boolean;

    getRuntimeArrayFormulaCellData(): IRuntimeUnitDataType;

    getRuntimeFeatureRange(): { [featureId: string]: IFeatureDirtyRangeType };

    getRuntimeFeatureCellData(): { [featureId: string]: IRuntimeUnitDataType };
}

export class FormulaRuntimeService extends Disposable implements IFormulaRuntimeService {
    private _formulaExecuteStage: FormulaExecuteStageType = FormulaExecuteStageType.IDLE;

    private _stopState = false;

    private _currentRow: number = 0;
    private _currentColumn: number = 0;
    private _currentSubComponentId: string = '';
    private _currentUnitId: string = '';

    private _runtimeData: IRuntimeUnitDataType = {};

    private _runtimeOtherData: IRuntimeOtherUnitDataType = {}; // Data returned by other businesses through formula calculation, excluding the sheet.

    private _unitArrayFormulaRange: IArrayFormulaRangeType = {};

    private _runtimeArrayFormulaCellData: IRuntimeUnitDataType = {};

    private _runtimeClearArrayFormulaCellData: IRuntimeUnitDataType = {};

    private _runtimeFeatureRange: { [featureId: string]: IFeatureDirtyRangeType } = {};

    private _runtimeFeatureCellData: { [featureId: string]: IRuntimeUnitDataType } = {};

    private _functionsExecutedState: FormulaExecutedStateType = FormulaExecutedStateType.INITIAL;

    // lambdaId: { key: BaseAstNode }
    private _functionDefinitionPrivacyVar: Map<string, Map<string, Nullable<BaseAstNode>>> = new Map();

    private _totalFormulasToCalculate: number = 0;

    private _completedFormulasCount: number = 0;

    private _totalArrayFormulasToCalculate: number = 0;

    private _completedArrayFormulasCount: number = 0;

    private _isCycleDependency: boolean = false;

    constructor(@IFormulaCurrentConfigService private readonly _currentConfigService: IFormulaCurrentConfigService) {
        super();
    }

    get currentRow() {
        return this._currentRow;
    }

    get currentColumn() {
        return this._currentColumn;
    }

    get currentSubComponentId() {
        return this._currentSubComponentId;
    }

    get currentUnitId() {
        return this._currentUnitId;
    }

    override dispose(): void {
        this.reset();
        this._runtimeFeatureCellData = {};
        this._runtimeFeatureRange = {};
    }

    enableCycleDependency() {
        this._isCycleDependency = true;
    }

    disableCycleDependency() {
        this._isCycleDependency = false;
    }

    isCycleDependency() {
        return this._isCycleDependency;
    }

    setTotalArrayFormulasToCalculate(value: number) {
        this._totalArrayFormulasToCalculate = value;
    }

    getTotalArrayFormulasToCalculate() {
        return this._totalArrayFormulasToCalculate;
    }

    setCompletedArrayFormulasCount(value: number) {
        this._completedArrayFormulasCount = value;
    }

    getCompletedArrayFormulasCount() {
        return this._completedArrayFormulasCount;
    }

    setTotalFormulasToCalculate(value: number) {
        this._totalFormulasToCalculate = value;
    }

    getTotalFormulasToCalculate() {
        return this._totalFormulasToCalculate;
    }

    setCompletedFormulasCount(value: number) {
        this._completedFormulasCount = value;
    }

    getCompletedFormulasCount() {
        return this._completedFormulasCount;
    }

    markedAsSuccessfullyExecuted() {
        this._functionsExecutedState = FormulaExecutedStateType.SUCCESS;
    }

    markedAsNoFunctionsExecuted() {
        this._functionsExecutedState = FormulaExecutedStateType.NOT_EXECUTED;
    }

    markedAsStopFunctionsExecuted() {
        this._functionsExecutedState = FormulaExecutedStateType.STOP_EXECUTION;
    }

    markedAsInitialFunctionsExecuted() {
        this._functionsExecutedState = FormulaExecutedStateType.INITIAL;
    }

    stopExecution() {
        this._stopState = true;

        this.setFormulaExecuteStage(FormulaExecuteStageType.IDLE);
    }

    isStopExecution() {
        return this._stopState;
    }

    setFormulaExecuteStage(type: FormulaExecuteStageType) {
        this._formulaExecuteStage = type;
    }

    getFormulaExecuteStage() {
        return this._formulaExecuteStage;
    }

    reset() {
        this._formulaExecuteStage = FormulaExecuteStageType.IDLE;
        this._runtimeData = {};
        this._runtimeOtherData = {};
        this._unitArrayFormulaRange = {};
        this._runtimeArrayFormulaCellData = {};
        this._runtimeClearArrayFormulaCellData = {};

        // this._runtimeFeatureCellData = {};
        // this._runtimeFeatureRange = {};

        this._functionDefinitionPrivacyVar.clear();
        this.markedAsInitialFunctionsExecuted();

        this._isCycleDependency = false;

        this._totalFormulasToCalculate = 0;
        this._completedFormulasCount = 0;
    }

    setCurrent(row: number, column: number, sheetId: string, unitId: string) {
        this._currentRow = row;
        this._currentColumn = column;
        this._currentSubComponentId = sheetId;
        this._currentUnitId = unitId;
    }

    clearFunctionDefinitionPrivacyVar() {
        this._functionDefinitionPrivacyVar.clear();
    }

    registerFunctionDefinitionPrivacyVar(lambdaId: string, lambdaVar: Map<string, Nullable<BaseAstNode>>) {
        this._functionDefinitionPrivacyVar.set(lambdaId, lambdaVar);
    }

    getFunctionDefinitionPrivacyVar(lambdaId: string): Nullable<Map<string, Nullable<BaseAstNode>>> {
        return this._functionDefinitionPrivacyVar.get(lambdaId);
    }

    setRuntimeOtherData(formulaId: string, functionVariant: FunctionVariantType) {
        const subComponentId = this._currentSubComponentId;
        const unitId = this._currentUnitId;

        if (this._runtimeOtherData[unitId] === undefined) {
            this._runtimeOtherData[unitId] = {};
        }

        const unitData = this._runtimeOtherData[unitId];

        if (unitData[subComponentId] === undefined) {
            unitData[subComponentId] = {};
        }

        const subComponentData = unitData[subComponentId];

        subComponentData[formulaId] = this._objectValueToCellValue(functionVariant as CalculateValueType)!;
    }

    setRuntimeData(functionVariant: FunctionVariantType) {
        const row = this._currentRow;
        const column = this._currentColumn;
        const sheetId = this._currentSubComponentId;
        const unitId = this._currentUnitId;

        if (this._runtimeData[unitId] == null) {
            this._runtimeData[unitId] = {};
        }

        const unitData = this._runtimeData[unitId];

        if (unitData[sheetId] == null) {
            unitData[sheetId] = new ObjectMatrix<ICellData>();
        }

        if (this._unitArrayFormulaRange[unitId] == null) {
            this._unitArrayFormulaRange[unitId] = {};
        }

        const arrayFormulaRange = this._unitArrayFormulaRange[unitId];

        let arrayData = new ObjectMatrix<IRange>();

        if (!arrayFormulaRange[sheetId]) {
            arrayData = new ObjectMatrix(arrayFormulaRange[sheetId]);
        }

        if (this._runtimeArrayFormulaCellData[unitId] === undefined) {
            this._runtimeArrayFormulaCellData[unitId] = {};
        }

        const arrayFormulaCellData = this._runtimeArrayFormulaCellData[unitId];

        if (arrayFormulaCellData[sheetId] == null) {
            arrayFormulaCellData[sheetId] = new ObjectMatrix<ICellData>();
        }

        if (this._runtimeClearArrayFormulaCellData[unitId] === undefined) {
            this._runtimeClearArrayFormulaCellData[unitId] = {};
        }

        const clearArrayFormulaCellData = this._runtimeClearArrayFormulaCellData[unitId];

        if (clearArrayFormulaCellData[sheetId] == null) {
            clearArrayFormulaCellData[sheetId] = new ObjectMatrix<ICellData>();
        }

        const sheetData = unitData[sheetId];

        const arrayUnitData = arrayFormulaCellData[sheetId];

        const clearArrayUnitData = clearArrayFormulaCellData[sheetId];

        if (
            functionVariant.isReferenceObject() ||
            (functionVariant.isValueObject() && (functionVariant as BaseValueObject).isArray())
        ) {
            const objectValueRefOrArray = functionVariant as BaseReferenceObject | ArrayValueObject;

            const { startRow, startColumn, endRow, endColumn } = objectValueRefOrArray.getRangePosition();

            /**
             * If the referenced range or array only contains a single value, such as A5,
             * then it is not treated as an array range and is directly assigned.
             */
            if (startRow === endRow && startColumn === endColumn) {
                const valueObject = this._objectValueToCellValue(objectValueRefOrArray.getFirstCell());
                sheetData.setValue(row, column, valueObject);
                clearArrayUnitData.setValue(row, column, valueObject);
                return;
            }

            const arrayRange = {
                startRow: row,
                startColumn: column,
                endRow: endRow - startRow + row,
                endColumn: endColumn - startColumn + column,
            };

            if (this._checkIfArrayFormulaRangeHasData(unitId, sheetId, row, column, arrayRange)) {
                const errorObject = this._objectValueToCellValue(new ErrorValueObject(ErrorType.SPILL));
                sheetData.setValue(row, column, errorObject);
                clearArrayUnitData.setValue(row, column, errorObject);
            } else {
                const spillError = new ErrorValueObject(ErrorType.SPILL);
                objectValueRefOrArray.iterator((valueObject, rowIndex, columnIndex) => {
                    const value = this._objectValueToCellValue(valueObject);
                    if (rowIndex === startRow && columnIndex === startColumn) {
                        /**
                         * If the referenced range contains an error in the spill of the array formula,
                         * then the current array formula should report an error together.
                         */
                        if (valueObject.isErrorObject() && valueObject.isEqual(spillError)) {
                            clearArrayUnitData.setValue(row, column, {});
                            sheetData.setValue(row, column, { ...this._objectValueToCellValue(spillError) });
                            return false;
                        }
                        sheetData.setValue(row, column, { ...value });
                    }
                    arrayUnitData.setValue(rowIndex - startRow + row, columnIndex - startColumn + column, value);
                });

                arrayData.setValue(row, column, arrayRange);

                arrayFormulaRange[sheetId] = arrayData.getData();
            }
        } else {
            const valueObject = this._objectValueToCellValue(functionVariant as CalculateValueType);
            sheetData.setValue(row, column, valueObject);
            clearArrayUnitData.setValue(row, column, valueObject);
        }
    }

    getUnitData() {
        return this._runtimeData;
    }

    getUnitArrayFormula() {
        return this._unitArrayFormulaRange;
    }

    getRuntimeOtherData() {
        return this._runtimeOtherData;
    }

    getRuntimeArrayFormulaCellData() {
        return this._runtimeArrayFormulaCellData;
    }

    getRuntimeClearArrayFormulaCellData() {
        return this._runtimeClearArrayFormulaCellData;
    }

    getRuntimeFeatureRange() {
        return this._runtimeFeatureRange;
    }

    setRuntimeFeatureRange(featureId: string, featureRange: IFeatureDirtyRangeType) {
        this._runtimeFeatureRange[featureId] = featureRange;
    }

    getRuntimeFeatureCellData() {
        return this._runtimeFeatureCellData;
    }

    setRuntimeFeatureCellData(featureId: string, featureData: IRuntimeUnitDataType) {
        this._runtimeFeatureCellData[featureId] = featureData;
    }

    getAllRuntimeData(): IAllRuntimeData {
        return {
            unitData: this.getUnitData(),
            arrayFormulaRange: this.getUnitArrayFormula(),
            unitOtherData: this.getRuntimeOtherData(),
            functionsExecutedState: this._functionsExecutedState,
            arrayFormulaCellData: this.getRuntimeArrayFormulaCellData(),
            clearArrayFormulaCellData: this.getRuntimeClearArrayFormulaCellData(),

            runtimeFeatureRange: this.getRuntimeFeatureRange(),
            runtimeFeatureCellData: this.getRuntimeFeatureCellData(),
        };
    }

    getRuntimeState(): IExecutionInProgressParams {
        return {
            totalFormulasToCalculate: this.getTotalFormulasToCalculate(),

            completedFormulasCount: this.getCompletedFormulasCount(),

            totalArrayFormulasToCalculate: this.getTotalArrayFormulasToCalculate(),

            completedArrayFormulasCount: this.getCompletedArrayFormulasCount(),

            stage: this.getFormulaExecuteStage(),
        };
    }

    private _objectValueToCellValue(objectValue: CalculateValueType) {
        if (objectValue.isErrorObject()) {
            return {
                v: (objectValue as ErrorValueObject).getErrorType() as string,
                t: CellValueType.STRING,
            };
        }
        if (objectValue.isValueObject()) {
            const vo = objectValue as BaseValueObject;
            const v = vo.getValue();
            if (vo.isNumber()) {
                return {
                    v,
                    t: CellValueType.NUMBER,
                };
            }
            if (vo.isBoolean()) {
                return {
                    v,
                    t: CellValueType.BOOLEAN,
                };
            }
            return {
                v,
                t: CellValueType.STRING,
            };
        }
    }

    private _checkIfArrayFormulaRangeHasData(
        formulaUnitId: string,
        formulaSheetId: string,
        formulaRow: number,
        formulaColumn: number,
        arrayRange: IRange
    ) {
        const { startRow, startColumn, endRow, endColumn } = arrayRange;

        const unitData = this._currentConfigService.getUnitData();

        for (let r = startRow; r <= endRow; r++) {
            for (let c = startColumn; c <= endColumn; c++) {
                if (r === formulaRow && formulaColumn === c) {
                    continue;
                }

                const cell = this._runtimeData?.[formulaUnitId]?.[formulaSheetId]?.getValue(r, c);

                const currentCell = unitData?.[formulaUnitId]?.[formulaSheetId]?.cellData?.getValue(r, c);

                if (
                    (!isNullCell(cell) || !isNullCell(currentCell)) &&
                    this._isInDirtyRange(formulaUnitId, formulaSheetId, r, c)
                ) {
                    return true;
                }
            }
        }

        return false;
    }

    private _isInDirtyRange(unitId: string, sheetId: string, row: number, column: number) {
        const dirtyRanges = this._currentConfigService.getDirtyRanges();
        return isInDirtyRange(dirtyRanges, unitId, sheetId, row, column);
    }
}

export const IFormulaRuntimeService = createIdentifier<FormulaRuntimeService>('univer.formula.runtime.service');