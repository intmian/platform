import React, {useState} from 'react';
import {Select} from 'antd';

const {Option} = Select;

export function TagInput({tagOps, tags, onChange, disabled, width = 380, maxTagWidth = 5}) {
    const [inputValue, setInputValue] = useState('');

    const handleSearch = (value) => {
        setInputValue(value);
    };

    const handleSelect = (value, option) => {
        setInputValue('');
    };
    const options = tagOps.map((tag) => (
        {
            label: tag,
            value: tag,
            isNew: false,
        }
    ));

    let newTag = null;
    if (inputValue && !tagOps.includes(inputValue)) {
        newTag = {
            label: inputValue,
            value: inputValue,
            isNew: true,
        };
    }
    if (newTag) {
        options.push(newTag);
    }
    return (
        <Select
            mode="multiple"
            disabled={disabled}
            style={{width: width}}
            defaultValue={tags}
            placeholder="选择或新增标签"
            searchValue={inputValue}
            onSearch={handleSearch}
            onSelect={handleSelect}
            onChange={(value) => {
                if (onChange) {
                    onChange(value);
                }
            }}
            options={options}
            optionRender={(option) => {
                if (option.data.isNew) {
                    return (
                        <div>
                            <span>{option.data.label}</span>
                            <span style={{float: 'right'}}>新增</span>
                        </div>
                    );
                } else {
                    return (
                        <div>
                            <span>{option.data.label}</span>
                        </div>
                    );
                }
            }}
        />

    );
}

export default TagInput;
