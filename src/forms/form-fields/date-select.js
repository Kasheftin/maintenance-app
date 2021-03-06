import React from 'react';
import DatePicker from 'material-ui/DatePicker/DatePicker';
import IconButton from 'material-ui/IconButton/IconButton';

export default React.createClass({
    propTypes: {
        value: React.PropTypes.string,
        labelText: React.PropTypes.string.isRequired,
        onChange: React.PropTypes.func.isRequired,
    },

    renderDatePicker() {
        return (
            <DatePicker
                {...this.props}
                value={this.props.value && new Date(this.props.value)}
                mode="portrait"
                autoOk
                floatingLabelText={this.props.labelText}
                onChange={this._onDateSelect}
            />
        );
    },

    render() {
        const styles = {
            closeButton: {
                position: 'absolute',
                right: '-16px',
                top: '28px',
                zIndex: 1,
            },
            closeIcon: {
                color: '#888888',
            },
        };

        return (
            <div>
                {!this.props.isRequired && this.props.value !== undefined && this.props.value !== '' ? (
                    <IconButton
                        iconClassName="material-icons"
                        style={styles.closeButton}
                        iconStyle={styles.closeIcon}
                        onClick={this._clearDate}
                    >close</IconButton>
                ) : null}
                {this.renderDatePicker()}
            </div>
        );
    },

    _clearDate() {
        this._onDateSelect(undefined, '');
    },

    _onDateSelect(event, date) {
        this.props.onChange({
            target: {
                value: date,
            },
        });
    },
});
