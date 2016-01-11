import React from 'react';

import TextField from 'material-ui/lib/text-field';
import log from 'loglevel';

import d2 from 'd2/lib/d2';
import ModelTypeSelector from './ModelTypeSelector.component';
import Store from 'd2-flux/store/Store';
import ItemSelector from './ItemSelector.component';
import Translate from 'd2-ui/lib/i18n/Translate.mixin';
import GroupEditor from 'd2-ui/lib/group-editor/GroupEditor.component';

export default React.createClass({
    mixins: [Translate],

    getInitialState() {
        const itemStore = Store.create();
        const assignedItemStore = Store.create();
        const itemListStore = Store.create();

        itemStore.state = [];
        assignedItemStore.state = [];

        return {
            itemListStore,
            itemStore,
            assignedItemStore,
            filterText: '',
            showGroupEditor: false,
        };
    },

    renderGroupEditor() {
        if (!this.state.showGroupEditor) {
            return [];
        }

        return [
            <ItemSelector
                itemListStore={this.state.itemListStore}
                onChange={this._workItemChanged}
            />,
            <TextField
                fullWidth
                hintText={this.getTranslation('search_available_selected_items')}
                defaultValue={this.state.filterText}
                onChange={this._setFilterText}
            />,
            <GroupEditor
                itemStore={this.state.itemStore}
                assignedItemStore={this.state.assignedItemStore}
                onAssignItems={this._assignItems}
                onRemoveItems={this._removeItems}
                filterText={this.state.filterText}
            />
        ];
    },

    render() {
        const contentStyle = {
            padding: '2rem',
        };

        return (
            <div style={contentStyle}>
                <ModelTypeSelector
                    nameListFilter={['indicatorGroup', 'dataElementGroup']}
                    onChange={this._typeChanged}
                />
                {this.renderGroupEditor()}
            </div>
        );
    },

    createUrls(items) {
        const {modelToEdit, itemDefinition} = this.state;

        return items
            .map(id => `${modelToEdit.modelDefinition.plural}/${modelToEdit.id}/${itemDefinition}/${id}`);
    },

    _assignItems(items) {
        const requests = this.createUrls(items)
            .map(url => {
                return d2.getInstance()
                    .then(d2 => d2.Api.getApi())
                    .then(api => api.post(url));
            });

        return Promise.all(requests)
            .then(() => {
                const itemDefinition = this.state.modelToEdit.modelDefinition.name.replace('Group', '');

                return d2.getInstance()
                    .then((d2) => {
                        return Promise.all([d2, d2.models[this.state.modelToEdit.modelDefinition.name].get(this.state.modelToEdit.id)]);
                    })
                    .then(([d2, fullModel]) => {
                        this.state.assignedItemStore.setState(fullModel[d2.models[itemDefinition].plural]);
                        this.setState({
                            modelToEdit: fullModel,
                        });
                    })
                    .catch(message => log.error(message));
            });
    },

    _removeItems(items) {
        const requests = this.createUrls(items)
            .map(url => {
                return d2.getInstance()
                    .then(d2 => d2.Api.getApi())
                    .then(api => api.delete(url));
            });

        return Promise.all(requests)
            .then(() => {
                const itemDefinition = this.state.modelToEdit.modelDefinition.name.replace('Group', '');

                return d2.getInstance()
                    .then((d2) => {
                        return Promise.all([d2, d2.models[this.state.modelToEdit.modelDefinition.name].get(this.state.modelToEdit.id)]);
                    })
                    .then(([d2, fullModel]) => {
                        this.state.assignedItemStore.setState(fullModel[d2.models[itemDefinition].plural]);
                        this.setState({
                            modelToEdit: fullModel,
                        });
                    })
                    .catch(message => log.error(message));
            });
    },

    _typeChanged(event) {
        const modelDef = event.target.value;

        modelDef.list({paging: false, fields: 'id,displayName,name'})
            .then(modelCollection => modelCollection.toArray())
            .then(models => this.state.itemListStore.setState(models))
            .then(() => this.setState({showGroupEditor: true}))
            .catch(message => log.error(message));
    },

    _setFilterText(event) {
        this.setState({
            filterText: event.target.value,
        });
    },

    _workItemChanged(event) {
        const model = event.target.value;
        const itemDefinition = model.modelDefinition.name.replace('Group', '');

        d2.getInstance()
            .then((d2) => {
                if (!d2.models[itemDefinition]) {
                    return Promise.reject('This groupType does not have a model named: ' + itemDefinition);
                }

                const availablePromise = d2.models[itemDefinition].list({paging: false})
                const modelPromise = d2.models[model.modelDefinition.name].get(model.id);

                Promise.all([availablePromise, modelPromise])
                    .then(([availableItems, fullModel]) => {
                        this.state.itemStore.setState(availableItems);
                        this.state.assignedItemStore.setState(fullModel[d2.models[itemDefinition].plural]);
                        this.setState({
                            modelToEdit: fullModel,
                            itemDefinition: d2.models[itemDefinition].plural,
                        });
                    });
            })
            .catch(message => log.error(message));
    },

    reset() {
        if (!this.state.modelToEdit) {return;}

        const itemDefinition = this.state.modelToEdit.modelDefinition.name.replace('Group', '');

        return d2.getInstance()
            .then((d2) => {
                return Promise.all([d2, d2.models[this.state.modelToEdit.modelDefinition.name].get(this.state.modelToEdit.id)]);
            })
            .then(([d2, fullModel]) => {
                this.state.assignedItemStore.setState(fullModel[d2.models[itemDefinition].plural]);
                this.setState({
                    modelToEdit: fullModel,
                });
            })
            .catch(message => log.error(message));
    },
});
