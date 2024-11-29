import {lazy, useState} from 'react';
import {Select} from 'antd';

const {pinyin} = lazy(() => import('pinyin'));

const {Option} = Select;

export function TagInput({
                             tagOps,
                             tags,
                             onChange,
                             disabled,
                             style,
                             tips = '选择或新增标签',

                             maxTagCount,
                             maxTagTextLength,
                             maxTagPlaceholder,
                         }) {
    const [inputValue, setInputValue] = useState('');

    const handleSearch = (value) => {
        setInputValue(value);
    };

    const handleSelect = (value, option) => {
        setInputValue('');
    };

    let tagOps2 = [];
    // 将tags传入tagOps
    if (tags !== null && tags !== undefined) {
        for (let i = 0; i < tags.length; i++) {
            if (!tagOps2.includes(tags[i])) {
                tagOps2.push(tags[i]);
            }
        }
    }

    for (let i = 0; i < tagOps.length; i++) {
        if (!tagOps2.includes(tagOps[i])) {
            tagOps2.push(tagOps[i]);
        }
    }

    const options = tagOps2.map((tag) => (
        {
            label: tag,
            value: tag,
            isNew: false,
        }
    ));

    let newTag = null;
    if (inputValue && !tagOps2.includes(inputValue)) {
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
            style={style}
            defaultValue={tags}
            value={tags}
            placeholder={tips}
            searchValue={inputValue}
            onSearch={handleSearch}
            onSelect={handleSelect}
            filterOption={
                (input, option) => {
                    // 支持拼音搜索 使用pinyin库
                    const inputPinyin = pinyin(input, {style: pinyin.STYLE_NORMAL}).join('');
                    const optionPinyin = pinyin(option.label, {style: pinyin.STYLE_NORMAL}).join('');
                    return optionPinyin.includes(inputPinyin);
                }
            }
            onChange={(value) => {
                if (onChange) {
                    onChange(value);
                }
            }}
            options={options}
            // maxTagCount='responsive'
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
            maxTagCount={maxTagCount}
            maxTagTextLength={maxTagTextLength}
            maxTagPlaceholder={maxTagPlaceholder}
        />

    );
}

export default TagInput;
