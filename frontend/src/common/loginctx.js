import {createContext} from "react";

class LoginInfo {
    constructor() {
        this.usr = null;
        this.permissions = [];
        this.lastValid = null;
    }
}

export const loginInfo = createContext(new LoginInfo());