//
// Copyright © 2021-2022, David Priver
//

//
// Definitions for Binary and Unary are shared between
// client and server and so are in the shared types.
//
const evaluate_script = (function(){
    const enum TokenKind {
        // 0 is reserved for "not a token"
        IDENT    =  1,
        IF       =  2, // if
        ELSE     =  3, // else
        NUMBER   =  4,
        DIE      =  5,
        OTHER    =  6,
        USE      =  7, // use, using
        REPEAT   =  8, // repeat, loop, times

        LPAREN   =  9, // (
        RPAREN   = 10, // )
        LT       = 11,
        GT       = 12,
        LE       = 13, // ≤
        GE       = 14, // ≥
        NE       = 15, // ≠
        BANG     = 16, // !
        STAR     = 17, // *
        PLUS     = 18, // +
        SLASH    = 19, // /
        COLON    = 20, // :
        BACKTICK = 21, // `
        EQUALS   = 22, // =
        MINUS    = 23, // -

        SPACE    = 24,
        ENDLINE  = 25,

        DQUOTE   = 26, // "
        SQUOTE   = 27, // '

        DOT      = 28, // .
        COMMENT  = 29, // # ...
    }
    function is_end(t:TokenKind):boolean{
        return t == TokenKind.ENDLINE || t == TokenKind.COMMENT;
    }
    type Token = {
        kind: TokenKind,
        text: string,
    }

    const enum StatementKind {
        LIST   = 0,
        ROLL   = 1,
        BLOCK  = 2,
        IF     = 3,
        ASSIGN = 4,
        USE    = 5,
        RAW    = 6,
        REPEAT = 7,
    }

    type RawStatement = {
        kind: StatementKind.RAW,
        content: string,
        command: ChatCommand.TABLE | ChatCommand.SAY | ChatCommand.NAME | ChatCommand.MYTABLE | ChatCommand.STYLE,
        original: string, // for table
    }

    type ListStatement = {
        kind: StatementKind.LIST,
        content: string,
        command: ChatCommand.SHUFFLE | ChatCommand.CHOOSE,
        items: Array<string>
    }

    type RollStatement = {
        kind: StatementKind.ROLL,
        contents: Array<Token>,
        expr: Expression,
    }

    type BlockStatement = {
        kind: StatementKind.BLOCK,
        statements: Array<Statement>,
        parent: BlockStatement | null,
        indentation: number,
    }

    type Elif = {
        test: Expression,
        block: BlockStatement,
    }

    type IfStatement = {
        kind: StatementKind.IF,
        test: Expression,
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
    type RepeatStatement = {
        kind: StatementKind.REPEAT,
        expr: Expression,
        block: BlockStatement,
    }

    type Statement = RollStatement | IfStatement | AssignStatement | BlockStatement | UseStatement | RawStatement | ListStatement | RepeatStatement;

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
                else if(lower == "else")
                    tok.kind = TokenKind.ELSE;
                else if(lower == "use")
                    tok.kind = TokenKind.USE;
                else if(lower == "using")
                    tok.kind = TokenKind.USE;
                else if(lower == "repeat")
                    tok.kind = TokenKind.REPEAT;
                else if(lower == "loop")
                    tok.kind = TokenKind.REPEAT;
                else if(lower == "times")
                    tok.kind = TokenKind.REPEAT;
                result.push(tok);
                i--;
                continue;
            }
            if(isnum(c)){
                for(i++; i < text.length; i++){
                    if(!isnum(text[i])) break;
                }
                if(text[i] == 'd' || text[i] == 'D'){
                    let j = i;
                    for(j++; j < text.length; j++){
                        if(!isnum(text[j])) break;
                    }
                    if(j != i){
                        i = j;
                        result.push({kind:TokenKind.DIE, text:text.slice(start, i)});
                        i--;
                        continue;
                    }
                }
                result.push({kind:TokenKind.NUMBER, text:text.slice(start, i)});
                i--;
                continue;
            }
            if(isspace(c)){
                for(i++; i < text.length; i++){
                    if(text[i] == '\n' || !isspace(text[i])) break;
                }
                result.push({kind:TokenKind.SPACE, text:text.slice(start, i)});
                i--;
                continue;
            }
            switch(c){
                case '(': result.push({kind:TokenKind.LPAREN,  text:c}); continue;
                case ')': result.push({kind:TokenKind.RPAREN,  text:c}); continue;
                case '<': result.push({kind:TokenKind.LT,      text:c}); continue;
                case '>': result.push({kind:TokenKind.GT,      text:c}); continue;
                case '≤': result.push({kind:TokenKind.LE,      text:c}); continue;
                case '≥': result.push({kind:TokenKind.GE,      text:c}); continue;
                case '≠': result.push({kind:TokenKind.NE,      text:c}); continue;
                case '!': result.push({kind:TokenKind.BANG,    text:c}); continue;
                case '*': result.push({kind:TokenKind.STAR,    text:c}); continue;
                case '+': result.push({kind:TokenKind.PLUS,    text:c}); continue;
                case '/': result.push({kind:TokenKind.SLASH,   text:c}); continue;
                case ':': result.push({kind:TokenKind.COLON,   text:c}); continue;
                case '`': result.push({kind:TokenKind.BACKTICK,text:c}); continue;
                case '=': result.push({kind:TokenKind.EQUALS,  text:c}); continue;
                case '-': result.push({kind:TokenKind.MINUS,   text:c}); continue;
                case '“':
                case '”':
                case '"':
                    result.push({kind:TokenKind.DQUOTE,  text:c});
                    continue;
                case "‘":
                case "’":
                case "'":
                    result.push({kind:TokenKind.SQUOTE,  text:c});
                    continue;
                case '.': result.push({kind:TokenKind.DOT,     text:c}); continue;
                case '#':{
                    let start = i;
                    for(i++; i < text.length; i++){
                        if(text[i] == '\n') break;
                    }
                    result.push({kind:TokenKind.COMMENT, text:text.slice(start, i)});
                    continue;
                }
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

    const enum EXPR {
        NUMBER       = 0,
        DICE         = 1,
        GROUP        = 2,
        Binary       = 3,
        Unary        = 4,
        IDENT        = 5,
        DOTTED_IDENT = 6,
    }
    type NumberExpression = {
        type: EXPR.NUMBER,
        value: number,
    }
    type DiceExpression = {
        type: EXPR.DICE,
        n: number;
        base: number;
    }
    type IdentExpression = {
        type: EXPR.IDENT,
        ident: string,
    }
    type DottedIdentExpression = {
        type: EXPR.DOTTED_IDENT,
        namespace: string,
        ident: string,
    }
    type GroupExpression = {
        type: EXPR.GROUP,
        expr: Expression,
    }
    type BinaryExpression = {
        type: EXPR.Binary,
        btype: Binary,
        lhs: Expression,
        rhs: Expression,
    }
    type UnaryExpression = {
        type: EXPR.Unary,
        utype: Unary,
        expr: Expression,
    }
    type Expression = NumberExpression | DiceExpression | IdentExpression | GroupExpression | BinaryExpression | UnaryExpression | DottedIdentExpression;


    function parse_expression(tokens: Array<Token>): Expression | null{
        let index = 0;
        function current():Token {
            if(index >= tokens.length){
                return {
                    kind: TokenKind.ENDLINE,
                    text: '\n',
                };
            }
            return tokens[index];
        }
        function peek():Token {
            if(index+1 >= tokens.length){
                return {
                    kind: TokenKind.ENDLINE,
                    text: '\n',
                };
            }
            return tokens[index+1];
        }
        function skip_spaces(){
            while(current().kind == TokenKind.SPACE)
                index++;
        }
        function match(kinds:Array<TokenKind>): null | TokenKind {
            let c = current().kind;
            for(let k of kinds){
                if(k == c) {
                    index++;
                    return c;
                }
            }
            return null;
        }
        function match1(k1:TokenKind):boolean {
            if(current().kind == k1){
                index++;
                return true;
            }
            return false;
        }
        function match2(k1:TokenKind, k2:TokenKind): boolean {
            if(current().kind == k1 && peek().kind == k2){
                index += 2;
                return true;
            }
            return false;
        }
        function parse_comparison(): Expression | null {
            skip_spaces();
            let lhs = parse_addplus();
            if(!lhs) return lhs;
            skip_spaces();
            let c;
            while(c = match([TokenKind.BANG, TokenKind.LT, TokenKind.GT, TokenKind.EQUALS, TokenKind.LE, TokenKind.GE, TokenKind.NE])){
                let c2 = null;
                switch(c){
                    case TokenKind.LT:
                    case TokenKind.GT:
                    case TokenKind.BANG:
                    case TokenKind.EQUALS:
                        c2 = match1(TokenKind.EQUALS);
                        break;
                    default:
                        break;
                }
                if(c == TokenKind.BANG && !c2) return null;
                let rhs = parse_addplus();
                if(!rhs) return rhs;
                let op: Binary;
                switch(c){
                    case TokenKind.EQUALS: op = Binary.EQ; break;
                    case TokenKind.BANG: op = Binary.NE; break;
                    case TokenKind.LT: op = c2? Binary.LE : Binary.LT; break;
                    case TokenKind.GT: op = c2? Binary.GE : Binary.GT; break;
                    case TokenKind.GE: op = Binary.GE; break;
                    case TokenKind.LE: op = Binary.LE; break;
                    case TokenKind.NE: op = Binary.NE; break;
                    default: return null;
                }
                lhs = {
                    type: EXPR.Binary,
                    btype: op,
                    lhs: lhs,
                    rhs: rhs,
                };
                skip_spaces();
            }
            return lhs;
        }
        function parse_addplus():Expression | null{
            skip_spaces();
            let lhs = parse_divmul();
            if(!lhs) return lhs;
            skip_spaces();
            let c;
            while(c = match([TokenKind.PLUS, TokenKind.MINUS])){
                let rhs = parse_divmul();
                if(!rhs) return rhs;
                lhs = {
                    type: EXPR.Binary,
                    btype: c == TokenKind.PLUS? Binary.ADD : Binary.SUB,
                    lhs: lhs,
                    rhs: rhs,
                };
                skip_spaces();
            }
            return lhs;
        }
        function parse_divmul():Expression | null{
            skip_spaces();
            let lhs = parse_unary();
            if(!lhs) return lhs;
            skip_spaces();
            let c;
            while(c = match([TokenKind.SLASH, TokenKind.STAR])){
                let rhs = parse_unary();
                if(!rhs) return rhs;
                lhs = {
                    type: EXPR.Binary,
                    btype: c == TokenKind.SLASH? Binary.DIV : Binary.MUL,
                    lhs: lhs,
                    rhs: rhs,
                };
                skip_spaces();
            }
            return lhs;
        }
        function parse_unary():Expression | null{
            skip_spaces();
            let c;
            if(c = match([TokenKind.PLUS, TokenKind.BANG, TokenKind.MINUS])){
                skip_spaces();
                let expr = parse_unary();
                if(!expr) return null;
                return {
                    type: EXPR.Unary,
                    utype: c == TokenKind.PLUS? Unary.PLUS : c == TokenKind.BANG? Unary.NOT : Unary.NEG,
                    expr: expr,
                };
            }
            return parse_terminal();
        }
        function parse_terminal(): Expression | null {
            skip_spaces();
            let t = current();
            let c = match([TokenKind.LPAREN, TokenKind.NUMBER, TokenKind.DIE, TokenKind.IDENT]);
            if(!c) return null;
            switch(t.kind){
                case TokenKind.LPAREN:{
                    skip_spaces();
                    let expr = parse_comparison();
                    if(!expr) return null;
                    skip_spaces();
                    if(!match1(TokenKind.RPAREN))
                        return null
                    return {
                        type: EXPR.GROUP,
                        expr: expr,
                    };
                }
                case TokenKind.NUMBER:{
                    return {
                        type: EXPR.NUMBER,
                        value: +t.text,
                    };
                }
                case TokenKind.DIE:{
                    let [a, b] = t.text.split(/[dD]/);
                    let num = a.length? +a : 1;
                    let base = +b;
                    return {
                        type: EXPR.DICE,
                        n: num,
                        base: base,
                    };
                }
                case TokenKind.IDENT:{
                    let ident = t.text;
                    let spec = peek().text;
                    if(match2(TokenKind.DOT, TokenKind.IDENT)){
                        return {
                            type: EXPR.DOTTED_IDENT,
                            namespace: ident,
                            ident: spec,
                        };
                    }
                    return {
                        type: EXPR.IDENT,
                        ident: ident,
                    };
                }
                default:
                    return null;
            }
            return null;
        }
        let result = parse_comparison();
        skip_spaces();
        if(index != tokens.length) return null;
        return result;
    }

    function lookup(ident: string, vars: NameSpace): Array<Token> | null {
        let tokens = vars.get(ident.toLowerCase());
        if(!tokens) return null;
        return tokens;
    }

    function lookup_ns(ns_ident:string, ident:string, namespaces:Map<string, NameSpace>): Array<Token> | null{
        let ns = namespaces.get(ns_ident.toLowerCase());
        if(!ns) return null;
        let tokens = ns.get(ident.toLowerCase());
        if(!tokens) return null;
        return tokens;
    }

    function eval_expr(expr: Expression, namespaces:Map<string, Map<string, Array<Token>>>, vars:Map<string, Array<Token>>): number | null{
        switch(expr.type){
            case EXPR.NUMBER:
                return expr.value;
            // can't eval dice client side
            case EXPR.DICE:
                return null;
            case EXPR.IDENT:{
                let tokens = lookup(expr.ident, vars);
                if(!tokens) return null;
                let subexpr = parse_expression(tokens);
                if(!subexpr) return subexpr;
                return eval_expr(subexpr, namespaces, vars);
            }
            case EXPR.DOTTED_IDENT:{
                let tokens = lookup_ns(expr.namespace, expr.ident, namespaces);
                if(!tokens) return null;
                let subexpr = parse_expression(tokens);
                if(!subexpr) return subexpr;
                return eval_expr(subexpr, namespaces, vars);
            }
            case EXPR.GROUP:
                return eval_expr(expr.expr, namespaces, vars);
            case EXPR.Binary:{
                let lhs = eval_expr(expr.lhs, namespaces, vars);
                let rhs = eval_expr(expr.rhs, namespaces, vars);
                if(lhs === null) return null;
                if(rhs === null) return null;
                switch(expr.btype){
                    case Binary.ADD: return lhs + rhs;
                    case Binary.SUB: return lhs - rhs;
                    case Binary.MUL: return lhs * rhs;
                    case Binary.DIV:
                        if(!rhs) return 0;
                        return (lhs / rhs) | 0;
                    case Binary.EQ: return lhs == rhs? 1 : 0;
                    case Binary.NE: return lhs != rhs? 1 : 0;
                    case Binary.LT: return lhs <  rhs? 1 : 0;
                    case Binary.LE: return lhs <= rhs? 1 : 0;
                    case Binary.GT: return lhs >  rhs? 1 : 0;
                    case Binary.GE: return lhs >= rhs? 1 : 0;
                }
            }
            case EXPR.Unary:{
                let v = eval_expr(expr.expr, namespaces, vars);
                if(v === null) return null;
                switch(expr.utype){
                    case Unary.PLUS: return v;
                    case Unary.NOT:  return !v? 1 : 0;
                    case Unary.NEG:  return -v;
                }
            }

        }

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
        // @ts-ignore
        function peek():Token {
            if(index+1 >= tokens.length){
                return {
                    kind: TokenKind.ENDLINE,
                    text: '\n',
                };
            }
            return tokens[index+1];
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
                break;
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
        function parse_line():void{
            let token = current();
            let indentation = 0;
            if(token.kind == TokenKind.SPACE){
                indentation = token.text.length;
                token = take_and_next();
            }
            if(indentation <= currentblock.indentation)
                find_parent(indentation);
            switch(token.kind){
                case TokenKind.SPACE:
                    return;
                case TokenKind.IDENT:
                    switch(token.text.toLowerCase()){
                        case 'r': case 'roll': case 'ro': case 'rol': case 'rolll': case 'rl': case 'rll':
                            return parse_roll(1);
                        case 'name':
                            return parse_raw(ChatCommand.NAME, 1);
                        case 'shuffle': case 'shuff': case 'shuf':
                            return parse_list(ChatCommand.SHUFFLE, 1);
                        case 'choose':
                            return parse_list(ChatCommand.CHOOSE, 1);
                        case 'table':
                            return parse_raw(ChatCommand.TABLE, 1);
                        case 'mytable':
                            return parse_raw(ChatCommand.MYTABLE, 1);
                        case 'say':
                            return parse_raw(ChatCommand.SAY, 1);
                    }
                    if(peek_no_space().kind == TokenKind.EQUALS)
                        return parse_assignment();
                    else
                        return parse_raw(ChatCommand.SAY, 0);
                case TokenKind.PLUS:
                case TokenKind.MINUS:
                case TokenKind.LPAREN:
                case TokenKind.NUMBER:
                case TokenKind.DIE:
                    return parse_roll(0);
                case TokenKind.IF:
                    return parse_if(indentation);
                case TokenKind.REPEAT:
                    return parse_repeat(indentation);
                case TokenKind.ELSE:
                    return parse_else(indentation);
                case TokenKind.USE:
                    return parse_use();
                case TokenKind.ENDLINE:
                case TokenKind.COMMENT:
                    index++;
                    return;
                case TokenKind.SLASH:{
                    let peeked = peek_no_space();
                    switch(peeked.kind){
                        case TokenKind.PLUS:
                        case TokenKind.MINUS:
                        case TokenKind.LPAREN:
                        case TokenKind.NUMBER:
                        case TokenKind.DIE:
                            return parse_roll(1);
                        default:
                            break;
                    }
                    switch(peeked.text.toLowerCase()){
                        case 'r': case 'roll': case 'ro': case 'rol': case 'rolll': case 'rl': case 'rll':
                            return parse_roll(2);
                        case 'n': case 'name':
                            return parse_raw(ChatCommand.NAME, 2)
                        case 'sh': case 'shuffle': case 'shuff': case 'shuf':
                            return parse_list(ChatCommand.SHUFFLE, 2);
                        case 'ch': case 'choose':
                            return parse_list(ChatCommand.CHOOSE, 2);
                        case 't': case 'tab': case 'table':
                            return parse_raw(ChatCommand.TABLE, 2);
                        case 'mytable':
                            return parse_raw(ChatCommand.MYTABLE, 2);
                        case 's': case 'say':
                            return parse_raw(ChatCommand.SAY, 2);
                        case 'color': case 'colour':
                        case 'bold': case 'italic':
                        case 'anon': case 'reset':
                        case 'underline': case 'underlined':
                        case 'box': case 'boxed':
                        case 'big':
                            return parse_raw(ChatCommand.STYLE, 1);
                    }
                    return parse_raw(ChatCommand.SAY, 0);
                }
                case TokenKind.BACKTICK:
                    index++;
                    return parse_raw(ChatCommand.SAY, 0);
                default:
                    return parse_raw(ChatCommand.SAY, 0);
            }
        }

        function parse_list(command:ChatCommand.SHUFFLE | ChatCommand.CHOOSE, nskip:number){
            let text = '';
            while(nskip--){
                text += take().text;
            }

            let items = [];
            let quoted = 0;
            let item = '';
            for(;;){
                let t = take();
                if(is_end(t.kind))
                    break;
                text += t.text;
                if(!quoted && t.kind == TokenKind.SPACE){
                    if(item.length)
                        items.push(item)
                    item = '';
                    continue;
                }
                if(t.kind == quoted){
                    item += t.text;
                    quoted = 0;
                    items.push(item);
                    item = '';
                    continue;
                }
                if(quoted){
                    item += t.text;
                    continue;
                }
                if(t.kind == TokenKind.DQUOTE || t.kind == TokenKind.SQUOTE){
                    quoted = t.kind;
                    item = t.text;
                    continue;
                }
                if(t.kind == TokenKind.SPACE)
                    continue;
                items.push(t.text);
            }
            if(item)
                items.push(item);
            let stmt: ListStatement = {
                kind: StatementKind.LIST,
                content: text,
                command: command,
                items: items,
            };
            currentblock.statements.push(stmt);
        }
        function parse_assignment(){
            const startidx = index;
            function parse_as_raw(){
                index = startidx;
                return parse_raw(ChatCommand.SAY, 0);
            }
            let ident = take();
            if(ident.kind != TokenKind.IDENT)
                return parse_as_raw();
            skip_spaces();
            let equals = take();
            if(equals.kind != TokenKind.EQUALS)
                return parse_as_raw();
            skip_spaces();
            let rhs = [];
            for(;;){
                let tok = take();
                if(is_end(tok.kind))
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
        function parse_roll(nskip:number){
            let contents = [];
            for(;;){
                let tok = take();
                if(is_end(tok.kind))
                    break;
                contents.push(tok);
            }
            let expr = parse_expression(contents.slice(nskip));
            if(!expr){
                let result: RawStatement = {
                    kind: StatementKind.RAW,
                    command: ChatCommand.SAY,
                    original: '', // unused here
                    content: (function(){
                        let s = "";
                        for(let c of contents)
                            s += c.text;
                        return s;
                    }()),
                };
                console.log(result);
                currentblock.statements.push(result);
                return;
            }
            let statement:RollStatement = {
                kind: StatementKind.ROLL,
                contents: contents,
                expr: expr,
            };
            currentblock.statements.push(statement);
        }
        function parse_if(indentation:number){
            const startidx = index;
            function parse_as_raw(){
                index = startidx;
                return parse_raw(ChatCommand.SAY, 0);
            }
            let if_ = take();
            if(if_.kind != TokenKind.IF)
                return parse_as_raw();
            skip_spaces();
            let condtokens = [];
            for(;;){
                let tok = take();
                if(is_end(tok.kind))
                    return parse_as_raw();
                if(tok.kind == TokenKind.COLON)
                    break;
                condtokens.push(tok);
            }
            let expr = parse_expression(condtokens);
            if(!expr) return parse_as_raw();
            skip_spaces();
            let aftertokens = [];
            for(;;){
                let t = take();
                if(is_end(t.kind))
                    break;
                aftertokens.push(t);
            }
            let newif:IfStatement = {
                kind: StatementKind.IF,
                test: expr,
                iftrue: make_block(currentblock, indentation),
                iffalse: null,
                elifs: [],
            };
            currentblock.statements.push(newif);
            if(aftertokens.length){
                newif.iftrue.indentation = -1;
                parse(aftertokens, newif.iftrue);
                newif.iftrue.indentation = indentation;
            }
            else
                currentblock = newif.iftrue;
        }
        function parse_repeat(indentation:number){
            const startidx = index;
            function parse_as_raw(){
                index = startidx;
                return parse_raw(ChatCommand.SAY, 0);
            }
            let repeat = take();
            if(repeat.kind != TokenKind.REPEAT)
                return parse_as_raw();
            skip_spaces();
            let condtokens = [];
            for(;;){
                let tok = take();
                if(is_end(tok.kind))
                    return parse_as_raw();
                if(tok.kind == TokenKind.COLON)
                    break;
                condtokens.push(tok);
            }
            let expr = parse_expression(condtokens);
            if(!expr) return parse_as_raw();
            skip_spaces();
            let aftertokens = [];
            for(;;){
                let t = take();
                if(is_end(t.kind))
                    break;
                aftertokens.push(t);
            }
            let newrepeat:RepeatStatement = {
                kind: StatementKind.REPEAT,
                expr: expr,
                block: make_block(currentblock, indentation),
            };
            currentblock.statements.push(newrepeat);
            if(aftertokens.length){
                newrepeat.block.indentation = -1;
                parse(aftertokens, newrepeat.block);
                newrepeat.block.indentation = indentation;
            }
            else
                currentblock = newrepeat.block;
        }
        function parse_else(indentation:number){
            // this one doesn't add a statement to the currentblock
            // It just modifies the previous if statement at the right level.
            const startidx = index;
            function parse_as_raw(){
                index = startidx;
                return parse_raw(ChatCommand.SAY, 0);
            }
            let else_ = take();
            if(!currentblock.statements.length){
                return parse_as_raw();
            }
            let prev_statement = currentblock.statements[currentblock.statements.length-1];
            if(prev_statement.kind != StatementKind.IF){
                return parse_as_raw();
            }
            if(else_.kind != TokenKind.ELSE)
                return parse_as_raw();
            skip_spaces();
            let col_or_if = take();
            skip_spaces();
            if(col_or_if.kind == TokenKind.COLON){
                let end = take();
                if(!is_end(end.kind))
                    return parse_as_raw();
                if(prev_statement.iffalse !== null)
                    return parse_as_raw();
                let newblock= make_block(currentblock, indentation);
                prev_statement.iffalse = newblock;
                currentblock = newblock;
                return;
            }
            if(col_or_if.kind != TokenKind.IF)
                return parse_as_raw();
            let condtokens = [];
            for(;;){
                let tok = take();
                if(is_end(tok.kind))
                    return parse_as_raw();
                if(tok.kind == TokenKind.COLON)
                    break;
                condtokens.push(tok);
            }
            let expr = parse_expression(condtokens);
            if(!expr) return parse_as_raw();
            skip_spaces();
            let end = take();
            if(!is_end(end.kind))
                return parse_as_raw();
            let newblock = make_block(currentblock, indentation);
            let elif:Elif = {
                test: expr,
                block: newblock,
            }
            prev_statement.elifs.push(elif);
            currentblock = newblock;
        }
        function parse_use(){
            const startidx = index;
            function parse_as_raw(){
                index = startidx;
                return parse_raw(ChatCommand.SAY, 0);
            }
            let use = take();
            if(use.kind != TokenKind.USE){
                return parse_as_raw();
            }
            skip_spaces();
            let ident = take();
            if(ident.kind != TokenKind.IDENT){
                return parse_as_raw();
            }
            skip_spaces();
            let end = take();
            if(!is_end(end.kind)){
                return parse_as_raw();
            }
            let usestatement:UseStatement = {
                kind: StatementKind.USE,
                name: ident,
            };
            currentblock.statements.push(usestatement);
        }
        function parse_raw(command:ChatCommand.SAY | ChatCommand.TABLE | ChatCommand.MYTABLE | ChatCommand.NAME | ChatCommand.STYLE, nskip:number){
            let raw: RawStatement = {
                kind: StatementKind.RAW,
                content: '',
                command: command,
                original: ''
            };
            while(nskip--){
                raw.original += take().text;
            }
            for(;;){
                let tok = take();
                if(tok.kind == TokenKind.COMMENT){
                    raw.content += tok.text;
                    raw.original += tok.text;
                    break;
                }
                if(tok.kind == TokenKind.ENDLINE)
                    break;
                raw.content += tok.text;
                raw.original += tok.text;
            }
            currentblock.statements.push(raw);
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


    type NameSpace = Map<string, Array<Token>>;


    function expand_dice(expr: Expression, namespaces:Map<string, NameSpace>, vars:NameSpace, muldiv:boolean, visited:Set<string>): UnrolledDiceExpr | null {
        switch(expr.type){
            case EXPR.NUMBER:
                return [DieExprTypes.NUMBER, expr.value];
            case EXPR.DICE:
                return [DieExprTypes.DICE, expr.n, expr.base];
            case EXPR.GROUP:{
                let e = expand_dice(expr.expr, namespaces, vars, false, visited);
                if(!e) return e;
                return [DieExprTypes.GROUP, e];
            }
            case EXPR.Binary:{
                let childmuldiv = expr.btype == Binary.MUL || expr.btype == Binary.DIV;
                let lhs = expand_dice(expr.lhs, namespaces, vars, childmuldiv, visited);
                if(!lhs) return lhs;
                let rhs = expand_dice(expr.rhs, namespaces, vars, childmuldiv, visited);
                if(!rhs) return rhs;
                let result: UnrolledDiceExpr = [DieExprTypes.Binary, expr.btype, lhs, rhs];
                if(muldiv && !childmuldiv)
                    return [DieExprTypes.GROUP, result];
                return result;
            }
            case EXPR.Unary:{
                let e = expand_dice(expr.expr, namespaces, vars, false, visited);
                if(!e) return e;
                return [DieExprTypes.Unary, expr.utype, e];
            }
            case EXPR.IDENT:{
                let key = expr.ident;
                if(visited.has(key)) return null;
                visited.add(key);
                let toks = lookup(expr.ident, vars);
                if(!toks) return null;
                let e = parse_expression(toks);
                if(!e) return null;
                return expand_dice(e, namespaces, vars, muldiv, visited);
            }
            case EXPR.DOTTED_IDENT:{
                let key = expr.namespace+'.'+expr.ident;
                if(visited.has(key)) return null;
                visited.add(key);
                let toks = lookup_ns(expr.namespace, expr.ident, namespaces);
                if(!toks) return null;
                let e = parse_expression(toks);
                if(!e) return null;
                return expand_dice(e, namespaces, vars, muldiv, visited);
            }
        }
    }

    function stringify_unrolled_dice(expr: UnrolledDiceExpr):string{
        switch(expr[0]){
            case DieExprTypes.NUMBER:
                return ""+expr[1];
            case DieExprTypes.DICE:{
                let n = expr[1];
                let base = expr[2];
                if(n != 1){
                    return ""+n+"d"+base;
                }
                return "d"+base;
            }
            case DieExprTypes.GROUP:
                return "("+stringify_unrolled_dice(expr[1])+")";
            case DieExprTypes.Unary:{
                switch(expr[1]){
                    case Unary.NEG:
                        return "-"+stringify_unrolled_dice(expr[2]);
                    case Unary.NOT:
                        return "!"+stringify_unrolled_dice(expr[2]);
                    case Unary.PLUS:
                        return "+"+stringify_unrolled_dice(expr[2]);
                }
            }
            case DieExprTypes.Binary:{
                let lhs = stringify_unrolled_dice(expr[2]);
                let rhs = stringify_unrolled_dice(expr[3]);
                let op = "";
                switch(expr[1]){
                    case Binary.ADD: op = " + " ; break;
                    case Binary.SUB: op = " - " ; break;
                    case Binary.MUL: op = "*"   ; break;
                    case Binary.DIV: op = "/"   ; break;
                    case Binary.EQ:  op = " = " ; break;
                    case Binary.NE:  op = " ≠ "; break;
                    case Binary.GT:  op = " > " ; break;
                    case Binary.GE:  op = " ≥ "; break;
                    case Binary.LT:  op = " < " ; break;
                    case Binary.LE:  op = " ≤ "; break;
                }
                return lhs + op + rhs;
            };
        }
    }

    function interpret(statement:Statement, namespaces:Map<string, NameSpace>, vars:NameSpace, outcommands:Array<Command>):string{
        switch(statement.kind){
            case StatementKind.LIST:{
                outcommands.push([statement.command, statement.content, statement.items]);
                return "";
            }
            case StatementKind.ROLL:{
                let unrolled = expand_dice(statement.expr, namespaces, vars, false, new Set());
                if(!unrolled){
                    let mess = "Failed to expand a variable in '";
                    for(let tok of statement.contents)
                        mess += tok.text;
                    mess += "'";
                    return mess;
                }
                outcommands.push([ChatCommand.ROLL, stringify_unrolled_dice(unrolled), unrolled]);
                return "";
            }break;
            case StatementKind.BLOCK:{
                for(let s of statement.statements){
                    let e = interpret(s, namespaces, vars, outcommands);
                    if(e) return e;
                }
                return "";
            }break;
            case StatementKind.IF:{
                let cond = eval_expr(statement.test, namespaces, vars);
                if(cond === null){
                    return "Failed to evaluate in if statement.";
                }
                if(cond){
                    let e = interpret(statement.iftrue, namespaces, vars, outcommands);
                    if(e) return e;
                }
                else {
                    let handled = false;
                    for(let elif of statement.elifs){
                        let t2 = eval_expr(elif.test, namespaces, vars);
                        if(t2){
                            handled = true;
                            let e = interpret(elif.block, namespaces, vars, outcommands);
                            if(e) return e;
                            return "";
                        }
                    }
                    if(!handled && statement.iffalse !== null){
                        let e = interpret(statement.iffalse, namespaces, vars, outcommands);
                        if(e) return e;
                    }
                }
                return "";
            }break;
            case StatementKind.REPEAT:{
                let n = eval_expr(statement.expr, namespaces, vars);
                if(n === null){
                    return "Failed to evaluate repeat statement times.";
                }
                for(let i = 0; i < n; i++){
                    let e = interpret(statement.block, namespaces, vars, outcommands);
                    if(e) return e;
                }
                return "";
            }
            case StatementKind.ASSIGN:{
                vars.set(statement.lhs.text.toLowerCase(), statement.rhs);
                return "";
            }break;
            case StatementKind.USE:{
                let ns = namespaces.get(statement.name.text.toLowerCase());
                if(!ns) return "";
                for(let [key, value] of ns.entries()){
                    vars.set(key.toLowerCase(), value);
                }
                return "";
            }break;
            case StatementKind.RAW:{
                if(statement.command == ChatCommand.TABLE){
                    outcommands.push([ChatCommand.TABLE, statement.original, statement.content.trim()]);
                    return "";
                }
                if(statement.command == ChatCommand.MYTABLE){
                    outcommands.push([ChatCommand.MYTABLE, statement.original, statement.content.trim()]);
                    return "";
                }
                outcommands.push([statement.command, statement.content.trim()]);
                return "";
            }break;
        }
    }

    function really_eval_script(text:string, namespaces:Map<string, NameSpace>, vars:NameSpace):Array<Command>{
        // const before = performance.now();
        let outlines: Array<Command> = [];
        let glob = make_block(null, -1);
        let tokens = tokenize(text);
        let err = parse(tokens, glob);
        if(err !== null) throw new Error(err);
        let err2 = interpret(glob, namespaces, vars, outlines);
        if(err2.length) throw new Error(err2);
        // const after = performance.now();
        // outlines.push(`Parsing took: ${after-before}ms`);
        return outlines;
    }

    function eval_script(text:string, vars:Map<string, number|string>, namespaces:Map<string, Map<string,number|string>>): Array<Command> {
        let newvars: Map<string, Array<Token>> = new Map();
        for(const[k, v] of vars.entries()){
            if(typeof v == 'string'){
                newvars.set(k, tokenize(v));
            }
            else {
                newvars.set(k, [{
                    kind: TokenKind.NUMBER,
                    text: "" + v,
                }]);
            }
        }
        let newnamespaces:Map<string, Map<string, Array<Token>>> = new Map();
        for(const [name, ns] of namespaces.entries()){
            let newnamespace: Map<string, Array<Token>> = new Map();
            for(const[k, v] of ns.entries()){
                if(typeof v == 'string'){
                    newnamespace.set(k, tokenize(v));
                }
                else {
                    newnamespace.set(k, [{
                        kind: TokenKind.NUMBER,
                        text: "" + v,
                    }]);
                }
            }
            newnamespaces.set(name, newnamespace);
        }
        return really_eval_script(text, newnamespaces, newvars);
    }
    return eval_script;
})();
