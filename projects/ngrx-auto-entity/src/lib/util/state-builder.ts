import { Action, createSelector, MemoizedSelector } from '@ngrx/store';
import { IEntityOptions } from '../decorators/entity-options';
import { ENTITY_OPTS_PROP, NAE_KEY_NAMES, NAE_KEYS } from '../decorators/entity-tokens';
import { entityStateName } from '../decorators/entity-util';
import { EntityIdentity } from '../types/entity-identity';
import { IActionMap } from './action-map';
import { buildActionMap } from './action-map-builder';
import { IEntityState } from './entity-state';
import { buildFacade } from './facade-builder';
import { makeEntity } from './make-entity';
import { IModelClass, IModelState } from './model-state';
import { ISelectorMap } from './selector-map';
import { buildSelectorMap } from './selector-map-builder';
import { FEATURE_AFFINITY } from './util-tokens';

const sortAlpha = (aKey: string, bKey: string): number => aKey.localeCompare(bKey);

const sortNumeric = (aKey: number, bKey: number): number => aKey - bKey;

const defaultSort = (aKey: EntityIdentity, bKey: EntityIdentity): number =>
  typeof aKey === 'string' ? sortAlpha(aKey, bKey as string) : sortNumeric(aKey, bKey as number);

export const NO_ENTITY_DECORATOR_MSG =
  // tslint:disable-next-line:max-line-length
  'Specified model is not decorated with @Entity. All automatic entities must be decorated with a modelName specified. Building of state aborted!';
const ensureEntityDecorator = <TModel>(type: IModelClass<TModel>): void => {
  if (!type[ENTITY_OPTS_PROP]) {
    const example = ` Example model with proper decoration:

@Entity({modelName: 'Test'})
export class Test {
  @Key yourKey: number | string;
  // ... other properties ...
}`;
    console.error('[NGRX-AE] ! ' + NO_ENTITY_DECORATOR_MSG + example);
    throw new Error(NO_ENTITY_DECORATOR_MSG);
  }
};

export const NO_ENTITY_KEY_MSG =
  // tslint:disable-next-line:max-line-length
  'Specified model has no properties decorated with @Key. All automatic entities must have at least one property identified as the entity key. Building of state aborted!';
const ensureEntityKey = <TModel>(type: IModelClass<TModel>): void => {
  if (!type.prototype[NAE_KEY_NAMES] || !type.prototype[NAE_KEYS]) {
    const example = ` Example model with proper decoration:

@Entity({modelName: '${type[ENTITY_OPTS_PROP].modelName}'})
export class ${type[ENTITY_OPTS_PROP].modelName} {
  @Key yourKey: number | string;
  // ... other properties ...
}`;
    console.error('[NGRX-AE] ! ' + NO_ENTITY_KEY_MSG + example);
    throw new Error(NO_ENTITY_KEY_MSG);
  }
};

export const NO_MODEL_NAME_MSG =
  // tslint:disable-next-line:max-line-length
  'Specified model is decorated with @Entity but does not specify a modelName, which is required for proper production execution. Building of state aborted!';
const ensureModelName = (opts: IEntityOptions) => {
  if (!opts.modelName) {
    const example = ` Example model with proper decoration:

@Entity({modelName: 'Test'})
export class Test {
  @Key yourKey: number | string;
  // ... other properties ...
}`;
    console.error('[NGRX-AE] ! ' + NO_MODEL_NAME_MSG + example);
    throw new Error(NO_MODEL_NAME_MSG);
  }
};

/**
 * Builds the initial Ngrx state for an entity
 *
 * @param type - the entity class
 * @param extraInitialState - the (optional) initial state
 */
export const buildState = <TState extends IEntityState<TModel>, TParentState extends any, TModel, TExtra>(
  type: IModelClass<TModel>,
  extraInitialState?: TExtra
): IModelState<TParentState, TState, TModel, TExtra> => {
  ensureEntityDecorator(type);
  ensureEntityKey(type);

  const opts = type[ENTITY_OPTS_PROP];
  ensureModelName(opts);

  const stateName = entityStateName(opts.modelName);

  const getState = (state: TParentState): TState & TExtra => {
    const modelState = state[stateName];
    if (!modelState) {
      // tslint:disable-next-line:max-line-length
      const message = `State for model ${opts.modelName} could not be found! Make sure you add your entity state to the parent state with a property named exactly '${stateName}'.`;
      const example = ` Example app state:

export interface AppState {
  // ... other states ...
  ${stateName}: IEntityState<${opts.modelName}>,
  // ... other states ...
}`;
      console.error('[NGRX-AE] ! ' + message + example);
      throw new Error(message);
    }
    return modelState;
  };

  const initialState = {
    entities: {},
    ids: [],
    ...extraInitialState
  } as TState & TExtra;

  // tslint:disable:variable-name
  let _actions: IActionMap<TModel>;
  let _selectors: ISelectorMap<TParentState, TModel>;
  let _facade;
  let _reducer: (state: IEntityState<TModel> & TExtra) => IEntityState<TModel> & TExtra;

  const entityState = getState as (state: TParentState) => TState & TExtra;
  let _makeEntity: (obj: any) => TModel;
  // tslint:enable:variable-name

  class StateBuilder {
    get entityState() {
      return entityState;
    }

    get initialState() {
      return initialState;
    }

    get actions() {
      _actions = _actions || buildActionMap(type);
      return _actions;
    }

    get selectors() {
      _selectors = _selectors || buildSelectorMap<TParentState, TState, TModel, TExtra>(getState);
      return _selectors;
    }

    get reducer() {
      _reducer =
        _reducer ||
        ((state = initialState): IEntityState<TModel> & TExtra => {
          return state;
        });
      return _reducer;
    }

    get makeEntity() {
      _makeEntity = _makeEntity || makeEntity(type);
      return _makeEntity;
    }

    get facade() {
      _facade = _facade || buildFacade<TModel, TParentState>(this.selectors);
      return _facade;
    }
  }

  const built = new StateBuilder();
  return built;
};

/**
 * Builds the Ngrx state for an entity that is part of a feature module
 *
 * @param type the entity class
 * @param featureStateName the name of the feature state
 * @param selectParentState a selector for the entity's parent state
 * @param extraInitialState the (optional) initial feature state
 */
export const buildFeatureState = <TState extends IEntityState<TModel>, TParentState extends any, TModel, TExtra>(
  type: IModelClass<TModel>,
  featureStateName: NonNullable<string>,
  selectParentState: MemoizedSelector<object, TParentState>,
  extraInitialState?: TExtra
): IModelState<TParentState, TState, TModel, TExtra> => {
  ensureEntityDecorator(type);
  ensureEntityKey(type);

  const opts = type[ENTITY_OPTS_PROP];
  ensureModelName(opts);

  const stateName = entityStateName(opts.modelName);

  (type as any)[FEATURE_AFFINITY] = featureStateName;

  const selectState = createSelector(selectParentState, (state: TParentState) => {
    if (!state) {
      // tslint:disable-next-line:max-line-length
      const message = `Could not retrieve feature state ${featureStateName} for model ${opts.modelName}! Make sure you add your entity state to the feature state with a property named exactly '${stateName}'.`;
      const example = ` Example app state:

export interface FeatureState {
  // ... other states ...
  ${stateName}: IEntityState<${opts.modelName}>,
  // ... other states ...
}`;
      console.error('[NGRX-AE] ! ' + message + example);
      throw new Error(message);
    }
    const modelState = state[stateName];
    if (!modelState) {
      const message = `State for model ${opts.modelName} in feature ${featureStateName} could not be found!`;
      console.error('[NGRX-AE] ! ' + message);
      throw new Error(message);
    }
    return modelState;
  });

  const initialState = {
    entities: {},
    ids: [],
    ...extraInitialState
  } as TState & TExtra;

  // tslint:disable:variable-name
  let _actions: IActionMap<TModel>;
  let _selectors: ISelectorMap<TParentState, TModel>;
  let _facade;
  let _reducer: (state: IEntityState<TModel> & TExtra) => IEntityState<TModel> & TExtra;

  const entityState = selectState as MemoizedSelector<TParentState, TState & TExtra>;
  let _makeEntity: (obj: any) => TModel;
  // tslint:enable:variable-name

  class StateBuilder {
    get entityState() {
      return entityState;
    }

    get initialState() {
      return initialState;
    }

    get actions() {
      _actions = _actions || buildActionMap(type);
      return _actions;
    }

    get selectors() {
      _selectors = _selectors || buildSelectorMap<TParentState, TState, TModel, TExtra>(selectState);
      return _selectors;
    }

    get reducer() {
      _reducer =
        _reducer ||
        ((state = initialState): IEntityState<TModel> & TExtra => {
          return state;
        });
      return _reducer;
    }

    get makeEntity() {
      _makeEntity = _makeEntity || makeEntity(type);
      return _makeEntity;
    }

    get facade() {
      _facade = _facade || buildFacade<TModel, TParentState>(this.selectors);
      return _facade;
    }
  }

  const built = new StateBuilder();
  return built;
};
