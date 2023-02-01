//
// Copyright © 2021-2023, David Priver
//

type Settings = {
    userid: number;
    darkmode: DarkMode;
    chat:{name: string;};
    demo: boolean;
    hidechat: boolean;
    macros:{
        macros: Array<Macro>;
        variables: Array<Variable>;
        characters: Array<Character>;
    };
    uimode: UiMode;
}
declare let SETTINGS: Settings;
