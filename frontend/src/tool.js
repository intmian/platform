import React from "react";

function getItem(label, key, icon, children, theme) {
    return {
        key,
        icon,
        children,
        label,
        theme,
    };
}

const useDebugValue = (value) => {
    React.useDebugValue(value);
    console.trace("State updated by:");
};

export {getItem, useDebugValue};