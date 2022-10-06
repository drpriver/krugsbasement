//
// Copyright © 2021-2022, David Priver
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
}
declare let SETTINGS: Settings;
// This silly magic string gets replaced with user-specific settings server-side;
"let SETTINGS = SETTINGS";
