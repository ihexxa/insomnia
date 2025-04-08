import { getExistingConsole } from './console';
import { getInterpolator } from './interpolator';

export class Environment {
    private _name: string;
    private kvs = new Map<string, boolean | number | string | undefined>();

    constructor(name: string, jsonObject: object | undefined) {
        this._name = name;
        this.kvs = new Map(Object.entries(jsonObject || {}));
    }

    get name() {
        return this._name;
    }

    has = (variableName: string) => {
        return this.kvs.has(variableName);
    };

    get = (variableName: string) => {
        return this.kvs.get(variableName);
    };

    set = (variableName: string, variableValue: boolean | number | string | undefined | null) => {
        if (variableValue === null) {
            getExistingConsole().warn(`Variable "${variableName}" has a null value`);
            return;
        }
        this.kvs.set(variableName, variableValue);
    };

    unset = (variableName: string) => {
        this.kvs.delete(variableName);
    };

    clear = () => {
        this.kvs.clear();
    };

    replaceIn = (template: string) => {
        return getInterpolator().render(template, this.toObject());
    };

    toObject = () => {
        return Object.fromEntries(this.kvs.entries());
    };
}

function mergeFolderLevelVars(folderLevelVars: Environment[]) {
    const mergedFolderLevelObject = folderLevelVars.reduce((merged: object, folderLevelEnv: Environment) => {
        return { ...merged, ...folderLevelEnv.toObject() };
    }, {});
    return new Environment('mergedFolderLevelVars', mergedFolderLevelObject);
}

/**
 * The `Variables` class is responsible for managing and interacting with multiple levels of variables
 * in a hierarchical structure. It provides methods to check for the existence of variables, retrieve
 * their values, set new values, and replace placeholders in templates with variable values.
 *
 * The variable levels include:
 * - Global variables
 * - Collection-level variables
 * - Environment-level variables
 * - Iteration data variables
 * - Folder-level variables (an array of environments)
 * - Local variables
 *
 * @remarks
 * This class assumes that each level of variables is represented by an `Environment` object,
 * which must implement methods like `has`, `get`, `set`, and `toObject`.
 *
 */
export class Variables {
    // TODO: support vars for all levels
    private globalVars: Environment;
    private collectionVars: Environment;
    private environmentVars: Environment;
    private iterationDataVars: Environment;
    private folderLevelVars: Environment[];
    private localVars: Environment;

    constructor(
        args: {
            globalVars: Environment;
            collectionVars: Environment;
            environmentVars: Environment;
            iterationDataVars: Environment;
            folderLevelVars: Environment[];
            localVars: Environment;
        },
    ) {
        this.globalVars = args.globalVars;
        this.collectionVars = args.collectionVars;
        this.environmentVars = args.environmentVars;
        this.iterationDataVars = args.iterationDataVars;
        this.folderLevelVars = args.folderLevelVars;
        this.localVars = args.localVars;
    }

    /**
     * Checks if a variable with the specified name exists in any of the variable scopes.
     *
     * The method searches through the following scopes in order:
     * - Global variables
     * - Collection variables
     * - Environment variables
     * - Iteration data variables
     * - Folder-level variables
     * - Local variables
     *
     * @param variableName - The name of the variable to check for existence.
     * @returns `true` if the variable exists in any of the scopes, otherwise `false`.
     */
    has = (variableName: string) => {
        const globalVarsHas = this.globalVars.has(variableName);
        const collectionVarsHas = this.collectionVars.has(variableName);
        const environmentVarsHas = this.environmentVars.has(variableName);
        const iterationDataVarsHas = this.iterationDataVars.has(variableName);
        const folderLevelVarsHas = this.folderLevelVars.some(vars => vars.has(variableName));
        const localVarsHas = this.localVars.has(variableName);

        return globalVarsHas || collectionVarsHas || environmentVarsHas || iterationDataVarsHas || folderLevelVarsHas || localVarsHas;
    };

    get = (variableName: string) => {
        let finalVal: boolean | number | string | object | undefined = undefined;
        [
            this.localVars,
            mergeFolderLevelVars(this.folderLevelVars),
            this.iterationDataVars,
            this.environmentVars,
            this.collectionVars,
            this.globalVars,
        ].forEach(vars => {
            const value = vars.get(variableName);
            if (!finalVal && value) {
                finalVal = value;
            }
        });

        return finalVal;
    };

    set = (variableName: string, variableValue: boolean | number | string | undefined | null) => {
        if (variableValue === null) {
            getExistingConsole().warn(`Variable "${variableName}" has a null value`);
            return;
        }

        this.localVars.set(variableName, variableValue);
    };

    replaceIn = (template: string) => {
        const context = this.toObject();
        return getInterpolator().render(template, context);
    };

    toObject = () => {
        return [
            this.globalVars,
            this.collectionVars,
            this.environmentVars,
            this.iterationDataVars,
            mergeFolderLevelVars(this.folderLevelVars),
            this.localVars,
        ].map(
            vars => vars.toObject()
        ).reduce(
            (ctx, obj) => ({ ...ctx, ...obj }),
            {},
        );
    };

    localVarsToObject = () => {
        return this.localVars.toObject();
    };
}

export class Vault extends Environment {

    constructor(name: string, jsonObject: object | undefined, enableVaultInScripts: boolean) {
        super(name, jsonObject);
        return new Proxy(this, {
            // throw error on get or set method call if enableVaultInScripts is false
            get: (target, prop, receiver) => {
                if (!enableVaultInScripts) {
                    throw new Error('Vault is disabled in script');
                }
                return Reflect.get(target, prop, receiver);
            },
            set: (target, prop, value, receiver) => {
                if (!enableVaultInScripts) {
                    throw new Error('Vault is disabled in script');
                }
                return Reflect.set(target, prop, value, receiver);
            },
        });
    }

    unset = () => {
        throw new Error('Vault can not be unset in script');
    };

    clear = () => {
        throw new Error('Vault can not be cleared in script');
    };

    set = () => {
        throw new Error('Vault can not be set in script');
    };

}
