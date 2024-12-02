import {useEffect, useRef, useState} from 'react';
import {Select} from 'antd';


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
    const [loadding, setLoadding] = useState(true);
    const pinyinLib = useRef(null);
    useEffect(() => {
        import('pinyin').then((pinyin) => {
            pinyinLib.current = pinyin;
            setLoadding(false);
        });
    }, []);

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
            disabled={disabled || loadding}
            style={style}
            defaultValue={tags}
            value={tags}
            placeholder={tips}
            searchValue={inputValue}
            onSearch={handleSearch}
            onSelect={handleSelect}
            filterOption={
                (input, option) => {
                    // 支持拼音搜索 使用pinyin库，如果不是纯字母不会开启拼音搜索，为了避免太多候选项，仅搜索开头。
                    let allLatin = true;
                    for (let i = 0; i < input.length; i++) {
                        if (input[i] < 'a' || input[i] > 'z') {
                            allLatin = false;
                            break;
                        }
                    }
                    if (!allLatin || pinyinLib.current === null) {
                        // 不是纯字母，不开启拼音搜索
                        return option.label.includes(input);
                    } else {
                        const inputPinyin = pinyinLib.current.pinyin(input, {style: "normal"}).join('');
                        const optionPinyin = pinyinLib.current.pinyin(option.label, {style: "normal"}).join('');
                        // 如果optionPinyin不是以inputPinyin开头，返回false
                        if (optionPinyin.length < inputPinyin.length) {
                            return false;
                        }
                        return optionPinyin.substring(0, inputPinyin.length) === inputPinyin;
                    }


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
