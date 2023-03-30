//
// Copyright © 2021-2023, David Priver
//

type Settings = {
    userid: number;
    darkmode: DarkMode;
    chat:{name: string;};
    demo: boolean;
    hidechat: boolean;
    hideleft: boolean;
    hidetools: boolean;
    macros:{
        macros: Array<Macro>;
        variables: Array<Variable>;
        characters: Array<Character>;
    };
    uimode: UiMode;
    DEV: boolean;
}
declare let SETTINGS: Settings;
