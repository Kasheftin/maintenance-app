import Action from 'd2-ui/lib/action/Action';
import modelToEditStore from './modelToEditStore';
import log from 'loglevel';
import { getInstance } from 'd2/lib/d2';
import indicatorGroupsStore from './indicatorGroupsStore';
import dataElementGroupStore from './data-element/dataElementGroupsStore';
import { Observable } from 'rx';
import { getOwnedPropertyJSON } from 'd2/lib/model/helpers/json';
import { map, pick, get, filter, flatten, compose, identity, head } from 'lodash';

const extractErrorMessagesFromResponse = compose(filter(identity), map(get('message')), flatten, map('errorReports'), flatten, map('objectReports'), get('typeReports'));

const objectActions = Action.createActionsFromNames([
    'getObjectOfTypeById',
    'getObjectOfTypeByIdAndClone',
    'saveObject',
    'afterSave',
    'saveAndRedirectToList',
    'update',
    'updateAttribute',
]);

const hackedSaves = {
    dataElement: function dataElementAfterSave(model, lastImportedId) {
        const removeUrls = dataElementGroupStore.state.remove
            .filter(id => id)
            .map(remove => `dataElementGroups/${remove}/dataElements/${lastImportedId}`);
        const uniqueRemoveUrls = Array.from((new Set(removeUrls)).values());
        const saveUrls = Object.keys(dataElementGroupStore.state.dataElementGroupValues)
            .map(key => dataElementGroupStore.state.dataElementGroupValues[key])
            .filter(id => id)
            .map(save => `dataElementGroups/${save}/dataElements/${lastImportedId}`);

        const removePromises = getInstance()
            .then(d2 => {
                const api = d2.Api.getApi();

                return Promise.all(uniqueRemoveUrls.map(url => api.delete(url)));
            });

        const savePromises = getInstance()
            .then(d2 => {
                const api = d2.Api.getApi();

                return Promise.all(saveUrls.map(url => api.post(url)));
            });

        return Observable.fromPromise(Promise.all([removePromises, savePromises]));
    },
    indicator: function indicatorAfterSave(model, lastImportedId) {
        const removeUrls = indicatorGroupsStore.state.remove
            .filter(id => id)
            .map(remove => `indicatorGroups/${remove}/indicators/${lastImportedId}`);
        const uniqueRemoveUrls = Array.from((new Set(removeUrls)).values());
        const saveUrls = Object.keys(indicatorGroupsStore.state.indicatorGroupValues)
            .map(key => indicatorGroupsStore.state.indicatorGroupValues[key])
            .filter(id => id)
            .map(save => `indicatorGroups/${save}/indicators/${lastImportedId}`);

        const removePromises = getInstance()
            .then(d2 => {
                const api = d2.Api.getApi();

                return Promise.all(uniqueRemoveUrls.map(url => api.delete(url)));
            });

        const savePromises = getInstance()
            .then(d2 => {
                const api = d2.Api.getApi();

                return Promise.all(saveUrls.map(url => api.post(url)));
            });

        return Observable.fromPromise(Promise.all([removePromises, savePromises]));
    },
};

function hasAfterSave(model) {
    if (!model || !model.modelDefinition) {
        return false;
    }

    if (Object.keys(hackedSaves).indexOf(model.modelDefinition.name) !== -1) {
        return true;
    }
    return false;
}

function getAfterSave(model, lastImportedId) {
    return hackedSaves[model.modelDefinition.name](model, lastImportedId);
}

objectActions.getObjectOfTypeById
    .subscribe(({ data, complete, error }) => {
        modelToEditStore
            .getObjectOfTypeById(data)
            .subscribe(complete, error);
    });

objectActions.getObjectOfTypeByIdAndClone
    .subscribe(({ data, complete, error }) => {
        modelToEditStore
            .getObjectOfTypeByIdAndClone(data)
            .subscribe(complete, error);
    });

objectActions.saveObject
    .filter(({ data }) => ['legendSet', 'dataSet'].indexOf(data.modelType) === -1)
    .subscribe(action => {
        const errorHandler = (message) => {
            action.error(message);
        };

        const successHandler = (response) => {
            if (hasAfterSave(modelToEditStore.state)) {
                log.debug('Handling after save');
                getAfterSave(modelToEditStore.state, response.response.uid)
                    .subscribe(
                        () => action.complete('success'),
                        errorHandler
                    );
            } else {
                action.complete('success');
            }
        };

        return modelToEditStore
            .save(action.data.id)
            .subscribe(successHandler, errorHandler);
    }, (e) => {
        log.error(e);
    });

function on(property, func, object) {
    return {
        ...object,
        [property]: func(object[property]),
    };
}

objectActions.saveObject
    .filter(({ data }) => data.modelType === 'legendSet')
    .subscribe(async ({ complete, error }) => {
        const legendSet = getOwnedPropertyJSON(modelToEditStore.getState());
        const legends = legendSet.legends;
        const metadataPayload = {
            legendSets: [on('legends', map(pick('id')), legendSet)],
            legends: legends,
        };

        const d2 = await getInstance();
        const api = d2.Api.getApi();

        try {
            const response = await api.post('metadata', metadataPayload);

            if (response.status !== 'ERROR') {
                complete('save_success');
            } else {
                const errorMessages = extractErrorMessagesFromResponse(response);

                error(d2.i18n.getTranslation('could_not_save_legend_set_($$message$$)', { message: head(errorMessages) || 'Unknown error!' }));
            }
        } catch (e) {
            error(d2.i18n.getTranslation('could_not_save_legend_set'));
            log.error(e);
        }
    }, (e) => log.error(e));

objectActions.saveObject
    .filter(({ data }) => data.modelType === 'dataSet')
    .subscribe(async ({ complete, error }) => {
        const d2 = await getInstance();
        const api = d2.Api.getApi();

        const dataSetModel = modelToEditStore.getState();
        const dataSetPayload = getOwnedPropertyJSON(dataSetModel);

        if (!dataSetPayload.id) {
            const dataSetId = await api.get('system/uid', { limit: 1 }).then(({ codes }) => codes[0]);
            dataSetPayload.id = dataSetId;
        }

        const dataSetElements = Array
            .from(dataSetModel.dataSetElements.values())
            .map(dataSetElement => getOwnedPropertyJSON(dataSetElement))
            .map(({ dataSet, ...other }) => {
                return {
                    dataSet: { ...dataSet, id: dataSet.id || dataSetPayload.id },
                    ...other,
                }
            });

        const metadataPayload = {
            dataSets: [dataSetPayload],
            dataSetElements,
        };

        try {
            const response = await api.post('metadata', metadataPayload);

            if (response.status === 'OK') {
                complete('save_success');
            } else {
                const errorMessages = extractErrorMessagesFromResponse(response);

                error(d2.i18n.getTranslation('could_not_save_data_set_($$message$$)', { message: head(errorMessages) || 'Unknown error!' }));
            }
        } catch (e) {
            error(d2.i18n.getTranslation('could_not_save_data_set'));
            log.error(e);
        }
    });

objectActions.update.subscribe(action => {
    const { fieldName, value } = action.data;
    const modelToEdit = modelToEditStore.getState();

    if (modelToEdit) {
        if (modelToEdit.attributes && Object.keys(modelToEdit.attributes).indexOf(fieldName) >= 0) {
            log.debug(`${fieldName} is a custom attribute. Setting ${fieldName} to ${value}`);
            modelToEdit.attributes[fieldName] = value;
            log.debug(`Value is now: ${modelToEdit.attributes[fieldName]}`);

            modelToEditStore.setState(modelToEdit);

            return action.complete();
        }

        if (!(modelToEdit[fieldName] && modelToEdit[fieldName].constructor && modelToEdit[fieldName].constructor.name === 'ModelCollectionProperty')) {
            log.debug(`Change ${fieldName} to ${value}`);
            modelToEdit[fieldName] = value;
            log.debug(`Value is now: ${modelToEdit.dataValues[fieldName]}`);
        } else {
            log.debug('Not updating anything');
        }

        modelToEditStore.setState(modelToEdit);

        action.complete();
    } else {
        log.error('modelToEdit does not exist');
        action.error();
    }
});

objectActions.updateAttribute.subscribe(action => {
    const { attributeName, value } = action.data;
    const modelToEdit = modelToEditStore.getState();

    modelToEdit.attributes[attributeName] = value;

    modelToEditStore.setState(modelToEdit);

    action.complete();
});

export default objectActions;
