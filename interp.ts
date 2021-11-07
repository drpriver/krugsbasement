const enum TokenKind {
    IDENT   = "IDENT",
    IF      = "IF",
    ELSE    = "ELSE",
    COLON   = "COLON",
    SPACE   = "SPACE",
    ENDLINE = "ENDLINE",
    NUMBER  = "NUMBER",
    EQUALS  = "EQUALS",
    SLASH   = "SLASH",
    DIE     = "DIE",
    OTHER   = "OTHER",
    USE    = "USE",
}
type Token = {
    kind: TokenKind,
    text: string,
}

const enum StatementKind {
    SAY = "say",
    ROLL = "roll",
    BLOCK = "block",
    IF = "if",
    ASSIGN = "assign",
    USE = "use",
}

type SayStatement = {
    kind: StatementKind.SAY,
    content: Array<Token>,
}

type RollStatement = {
    kind: StatementKind.ROLL,
    contents: Array<Token>,
}

type BlockStatement = {
    kind: StatementKind.BLOCK,
    statements: Array<Statement>,
    parent: BlockStatement | null,
    indentation: number,
}

type Elif = {
    test: Token,
    block: BlockStatement,
}

type IfStatement = {
    kind: StatementKind.IF,
    test: Token, // only support bare identifiers for now
    iftrue: BlockStatement,
    iffalse: BlockStatement | null,
    elifs: Array<Elif>,
}

type AssignStatement = {
    kind: StatementKind.ASSIGN,
    lhs: Token,
    rhs: Array<Token>,
}

type UseStatement = {
    kind: StatementKind.USE,
    name: Token,
}

type Statement = SayStatement | RollStatement | IfStatement | AssignStatement | BlockStatement | UseStatement;

function isstartident(char:string):boolean{
    return (/[a-zA-Z]/).test(char);
}
function iscontinueident(char:string):boolean{
    return (/[a-zA-Z_0-9]/).test(char);
}
function isnum(char:string):boolean{
    return (/[0-9]/).test(char);
}
function isspace(char:string):boolean{
    return (/\s/).test(char);
}

function tokenize(text:string): Array<Token> {
    let result:Array<Token> = [];
    for(let i = 0; i < text.length; i++){
        let c = text[i];
        let start = i;
        if(c == '\n'){
            result.push({kind:TokenKind.ENDLINE, text:c});
            continue;
        }
        if(c == 'd' || c == 'D'){
            if(i+1 < text.length){
                if(isnum(text[i+1])){
                    i++;
                    for(i++; i < text.length; i++){
                        if(!isnum(text[i])) break;
                    }
                    result.push({kind:TokenKind.DIE, text:text.slice(start, i)});
                    i--;
                    continue;
                }
            }
        }
        if(isstartident(c)){
            for(i++; i < text.length; i++){
                if(!iscontinueident(text[i])) break;
            }
            let tok = {kind:TokenKind.IDENT, text:text.slice(start, i)};
            let lower = tok.text.toLowerCase();
            if(lower == "if")
                tok.kind = TokenKind.IF;
            if(lower == "else")
                tok.kind = TokenKind.ELSE;
            // if(lower == "elif")
                // tok.kind = TokenKind.ELIF;
            if(lower == "use")
                tok.kind = TokenKind.USE;
            result.push(tok);
            i--;
            continue;
        }
        if(isnum(c)){
            for(i++; i < text.length; i++){
                if(!isnum(text[i])) break;
            }
            result.push({kind:TokenKind.NUMBER, text:text.slice(start, i)});
            i--;
            continue;
        }
        if(isspace(c)){
            for(i++; i < text.length; i++){
                if(!isspace(text[i])) break;
            }
            result.push({kind:TokenKind.SPACE, text:text.slice(start, i)});
            i--;
            continue;
        }
        switch(c){
            case '/':
                result.push({kind:TokenKind.SLASH, text:c});
                continue;
            case ':':
                result.push({kind:TokenKind.COLON, text:c});
                continue;
            case '=':
                result.push({kind:TokenKind.COLON, text:c});
                continue;
            default:
                result.push({kind:TokenKind.OTHER, text:c});
                continue;
        }
    }
    return result;
}


function make_block(parent:BlockStatement|null, indentation:number):BlockStatement{
    return {
        kind: StatementKind.BLOCK,
        statements: [],
        parent: parent,
        indentation:indentation,
    };
}

function parse(tokens:Array<Token>, topblock:BlockStatement): string | null{
    let index = 0;
    let currentblock = topblock;
    let error: string | null = null;
    function err(tok:Token, mess:string){
        error = `Error at '${tok.text}': ${mess}`;
    }
    function current():Token {
        if(index >= tokens.length){
            return {
                kind: TokenKind.ENDLINE,
                text: '\n',
            };
        }
        return tokens[index];
    }
    function skip_spaces(){
        while(current().kind == TokenKind.SPACE)
            index++;
    }
    function take():Token {
        let result = current();
        index++;
        return result;
    }
    function take_and_next(): Token {
        index++;
        return current();
    }
    function peek_no_space():Token {
        let i = index+1;
        for(;;i++){
            if(i >= tokens.length)
                return {
                    kind: TokenKind.ENDLINE,
                    text: '\n',
                };
            if(tokens[i].kind == TokenKind.SPACE)
                continue;
        }
        return tokens[i];
    }
    function find_parent(space_length:number){
        for(;;){
            let cb = currentblock.parent;
            if(!cb) throw new Error("Unable to find parent block of appropriate indentation");
            currentblock = cb;
            if(space_length > currentblock.indentation){
                return;
            }
        }
    }
    function parse_line(){
        let token = current();
        let indentation = 0;
        if(token.kind == TokenKind.SPACE){
            indentation = token.text.length;
            if(indentation <= currentblock.indentation)
                find_parent(indentation);
        }
        token = take_and_next();
        switch(token.kind){
            case TokenKind.SPACE: 
                return err(token, "Assertion Error");
            case TokenKind.EQUALS:
                return err(token, "Leading colon doesn't make sense");
            case TokenKind.COLON:
                return err(token, "Leading equals doesn't make sense");
            // @ts-ignore
            case TokenKind.IDENT:
                if(peek_no_space().kind == TokenKind.EQUALS){
                    parse_assignment();
                    return;
                }
            // fall-through
            case TokenKind.NUMBER:
            case TokenKind.DIE:
                parse_roll();
                return;
            case TokenKind.IF:
                parse_if(indentation);
                return;
            case TokenKind.ELSE:
                parse_else(indentation);
                return;
            case TokenKind.USE:
                parse_use();
                return;
            case TokenKind.ENDLINE:
                index++;
                return;
            case TokenKind.SLASH:
                if(peek_no_space().text == "say"){
                    parse_say();
                }
                parse_roll();
                return;
            default:
                return err(token, "Unhandled case");
        }
    }
    function parse_assignment(){
        let ident = take();
        if(ident.kind != TokenKind.IDENT)
            return err(ident, "Assertion error, should've been an ident");
        skip_spaces();
        let equals = take();
        if(equals.kind != TokenKind.EQUALS)
            return err(equals, "Assertion error, should've been an equals");
        skip_spaces();
        let rhs = [];
        for(;;){
            let tok = take();
            if(tok.kind == TokenKind.ENDLINE)
                break;
            rhs.push(tok);
        }
        let statement: AssignStatement = {
            kind: StatementKind.ASSIGN,
            lhs: ident,
            rhs: rhs,
        };
        currentblock.statements.push(statement);
    }
    function parse_roll(){
        let contents = [];
        for(;;){
            let tok = take();
            if(tok.kind == TokenKind.ENDLINE)
                break;
            contents.push(tok);
        }
        let statement:RollStatement = {
            kind: StatementKind.ROLL,
            contents: contents,
        };
        currentblock.statements.push(statement);
    }
    function parse_if(indentation:number){
        let if_ = take();
        if(if_.kind != TokenKind.IF)
            return err(if_, "Assertion error, should've been if");
        skip_spaces();
        let expr = take();
        if(expr.kind != TokenKind.IDENT)
            return err(expr, "Need an expression for an if statement");
        skip_spaces();
        let colon = take();
        if(colon.kind != TokenKind.COLON)
            return err(colon, "Need a colon after expression of if statement");
        skip_spaces();
        let endline = take();
        if(endline.kind != TokenKind.ENDLINE)
            return err(endline, "Need a newline after colon");
        let newif:IfStatement = {
            kind: StatementKind.IF,
            test: expr,
            iftrue: make_block(currentblock, indentation),
            iffalse: null,
            elifs: [],
        };
        currentblock.statements.push(newif);
        currentblock = newif.iftrue;
    }
    function parse_else(indentation:number){
        // this one doesn't add a statement to the currentblock
        // It just modifies the previous if statement at the right level.
        let else_ = take();
        if(!currentblock.statements.length)
            return err(else_, "No previous if for this else");
        let prev_statement = currentblock.statements[currentblock.statements.length-1];
        if(prev_statement.kind != StatementKind.IF)
            return err(else_, "No previous if for this else");
        if(else_.kind != TokenKind.ELSE)
            return err(else_, "assertion error, must have been an else");
        skip_spaces();
        let col_or_if = take();
        skip_spaces();
        if(col_or_if.kind == TokenKind.COLON){
            let end = take();
            if(end.kind != TokenKind.ENDLINE)
                return err(end, "Expected end of line after colon");
            if(prev_statement.iffalse !== null)
                return err(else_, "Duplicated else for if statement");
            let newblock= make_block(currentblock, indentation);
            prev_statement.iffalse = newblock;
            currentblock = newblock;
            return;
        }
        if(col_or_if.kind != TokenKind.IF)
            return err(col_or_if, "Must be a colon or an if");
        let expr = take();
        if(expr.kind != TokenKind.IDENT)
            return err(expr, "Bare identifiers as expressions expected for if statements");
        skip_spaces();
        let col = take();
        if(col.kind != TokenKind.COLON)
            return err(col, "Expected a colon after an if expression");
        skip_spaces();
        let end = take();
        if(end.kind != TokenKind.ENDLINE)
            return err(end, "Expected end of line after the colon after an if expression");
        let newblock = make_block(currentblock, indentation);
        let elif:Elif = {
            test: expr,
            block: newblock,
        }
        prev_statement.elifs.push(elif);
        currentblock = newblock;
    }
    function parse_use(){
        let use = take();
        if(use.kind != TokenKind.USE){
            return err(use, "Unexpected error, use begins with use");
        }
        skip_spaces();
        let ident = take();
        if(ident.kind != TokenKind.IDENT){
            return err(ident, "Expected an identifier for the target of the use statement");
        }
        skip_spaces();
        let end = take();
        if(end.kind != TokenKind.ENDLINE){
            return err(end, "Expected endline after identifier of use");
        }
        let usestatement:UseStatement = {
            kind: StatementKind.USE,
            name: ident,
        };
        currentblock.statements.push(usestatement);
    }
    function parse_say(){
        let say: SayStatement = {
            kind: StatementKind.SAY,
            content: [],
        };
        index+=2;
        for(;;){
            let tok = take();
            if(tok.kind == TokenKind.ENDLINE)
                break;
            say.content.push(tok);
        }
        currentblock.statements.push(say);
    }
    while(index < tokens.length && error === null){
        try{
            parse_line();
        }
        catch(e){
            err(tokens[index], ""+e);
            break;
        }
    }
    return error;
}

function interpret(statement:Statement, vars:Map<string, number>, outlines:Array<string>):string{
    switch(statement.kind){
        case StatementKind.SAY:{
            let s = "";
            for(let tok of statement.content)
                s += tok.text;
            outlines.push(s);
        }break;
        case StatementKind.ROLL:{
            let s = "";
            for(let tok of statement.contents){
                if(tok.kind == TokenKind.IDENT)
                    s += expand(vars, tok.text);
                else
                    s += tok.text;
            }
            outlines.push(s);
        }break;
        case StatementKind.BLOCK:{
            for(let s of statement.statements)
                interpret(s, vars, outlines);
        }break;
        case StatementKind.IF:{
            // let t = vars.get(
        }break;
    }
    return "";
}
const EXAMPLE = (
"    bonus = bab + dex + 2\n"+
"    if rapid:\n"+
"        /roll d20 + bonus - 2\n"+
"        /roll d20 + bonus - 2\n"+
"    else:\n"+
"        /roll d20 + bonus\n"
);
let glob = make_block(null, -1);
let tokens = tokenize(EXAMPLE);
let err = parse(tokens, glob);
if(err === null){
    let outlines: Array<string> = [];
    let vars: Map<string, number> = new Map();
    vars.set("rapid", 1);
    vars.set("bab", 2);
    vars.set("dex", 3);
    let err2 = interpret(glob, vars, outlines);
    console.log('err2', err2);
}
else {
    console.log('err', err);
}
console.log(glob);
