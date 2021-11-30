const evaluate_script = (function(){
    const enum TokenKind {
        IDENT    = "IDENT",
        IF       = "IF",
        ELSE     = "ELSE",
        NUMBER   = "NUMBER",
        DIE      = "DIE",
        OTHER    = "OTHER",
        USE      = "USE",

        LPAREN   = "(",
        RPAREN   = ")",
        LT       = "<",
        GT       = ">",
        BANG     = "!",
        STAR     = "*",
        PLUS     = "+",
        SLASH    = "/",
        COLON    = ":",
        BACKTICK = "`",
        EQUALS   = "=",
        MINUS    = "-",

        SPACE    = " ",
        ENDLINE  = "\n",
    }
    type Token = {
        kind: TokenKind,
        text: string,
    }

    const enum StatementKind {
        SLASH  = "slash",
        ROLL   = "roll",
        BLOCK  = "block",
        IF     = "if",
        ASSIGN = "assign",
        USE    = "use",
        RAW    = "raw",
    }

    type SlashStatement = {
        kind: StatementKind.SLASH,
        first: Token,
        content: Array<Token>,
    }
    type RawStatement = {
        kind: StatementKind.RAW,
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

    type Statement = SlashStatement | RollStatement | IfStatement | AssignStatement | BlockStatement | UseStatement | RawStatement;

    function isstartident(char:string):boolean{
        return (/[a-zA-Z]/).test(char);
    }
    function iscontinueident(char:string):boolean{
        return (/[a-zA-Z_0-9\.]/).test(char);
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
                    if(!isspace(text[i])) break;
                }
                result.push({kind:TokenKind.SPACE, text:text.slice(start, i)});
                i--;
                continue;
            }
            switch(c){
                case '(':
                case ')':
                case '<':
                case '>':
                case '!':
                case '*':
                case '+':
                case '/':
                case ':':
                case '`':
                case '=':
                case '-':
                    result.push({kind:c as TokenKind, text:c});
                    continue;
                case '#':
                    for(i++; i < text.length; i++){
                        if(text[i] == '\n') break;
                    }
                    result.push({kind:TokenKind.ENDLINE, text:'\n'});
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

    const enum EXPR {
        NUMBER = 0,
        DICE = 1,
        IDENT = 2,
        GROUP = 3,
        BINARY = 4,
        UNARY = 5,
    }
    const enum BINARY {
        ADD = 0,
        SUB = 1,
        MUL = 2,
        DIV = 3,
        EQ = 4,
        NE = 5,
        GT = 6,
        GE = 7,
        LT = 8,
        LE = 9,
    }
    const enum UNARY {
        PLUS = 0,
        NEG = 1,
        NOT = 2,
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
    type GroupExpression = {
        type: EXPR.GROUP,
        expr: Expression,
    }
    type BinaryExpression = {
        type: EXPR.BINARY,
        btype: BINARY,
        lhs: Expression,
        rhs: Expression,
    }
    type UnaryExpression = {
        type: EXPR.UNARY,
        utype: UNARY,
        expr: Expression,
    }
    type Expression = NumberExpression | DiceExpression | IdentExpression | GroupExpression | BinaryExpression | UnaryExpression;


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
        function parse_comparison(): Expression | null {
            skip_spaces();
            let lhs = parse_addplus();
            if(!lhs) return lhs;
            skip_spaces();
            let c;
            while(c = match([TokenKind.BANG, TokenKind.LT, TokenKind.GT, TokenKind.EQUALS])){
                let c2 = match([TokenKind.EQUALS]);
                if(c == TokenKind.BANG && !c2) return null;
                let rhs = parse_addplus();
                if(!rhs) return rhs;
                let op: BINARY;
                switch(c){
                    case TokenKind.EQUALS: op = BINARY.EQ; break;
                    case TokenKind.BANG: op = BINARY.NE; break;
                    case TokenKind.LT: op = c2? BINARY.LE : BINARY.LT; break;
                    case TokenKind.GT: op = c2? BINARY.GE : BINARY.GT; break;
                    default: return null;
                }
                lhs = {
                    type: EXPR.BINARY,
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
                    type: EXPR.BINARY,
                    btype: c == TokenKind.PLUS? BINARY.ADD : BINARY.SUB,
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
                    type: EXPR.BINARY,
                    btype: c == TokenKind.SLASH? BINARY.DIV : BINARY.MUL,
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
                let expr = parse_comparison();
                if(!expr) return null;
                return {
                    type: EXPR.UNARY,
                    utype: c == TokenKind.PLUS? UNARY.PLUS : c == TokenKind.BANG? UNARY.NOT : UNARY.NEG,
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
                    if(!match([TokenKind.RPAREN]))
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
                    return {
                        type: EXPR.IDENT,
                        ident: t.text,
                    };
                }
                default:
                    return null;
            }
            return null;
        }
        return parse_comparison();
    }
    function eval_expr(expr: Expression, vars:Map<string, Array<Token>>): number | null{
        switch(expr.type){
            case EXPR.NUMBER:
                return expr.value;
            // can't eval dice client side
            case EXPR.DICE:
                return null;
            case EXPR.IDENT:{
                let tokens = vars.get(expr.ident.toLowerCase());
                if(!tokens) return null;
                let subexpr = parse_expression(tokens);
                if(!subexpr) return subexpr;
                return eval_expr(subexpr, vars);
            }
            case EXPR.GROUP:
                return eval_expr(expr.expr, vars);
            case EXPR.BINARY:{
                let lhs = eval_expr(expr.lhs, vars);
                let rhs = eval_expr(expr.rhs, vars);
                if(lhs === null) return null;
                if(rhs === null) return null;
                switch(expr.btype){
                    case BINARY.ADD:
                        return lhs + rhs;
                    case BINARY.SUB:
                        return lhs - rhs;
                    case BINARY.MUL:
                        return lhs * rhs;
                    case BINARY.DIV:
                        if(!rhs) return 0;
                        return (lhs / rhs) | 0;
                    case BINARY.EQ:
                        return lhs == rhs? 1 : 0;
                    case BINARY.NE:
                        return lhs != rhs? 1 : 0;
                    case BINARY.LT:
                        return lhs < rhs? 1 : 0;
                    case BINARY.LE:
                        return lhs <= rhs? 1 : 0;
                    case BINARY.GT:
                        return lhs > rhs? 1 : 0;
                    case BINARY.GE:
                        return lhs >= rhs? 1 : 0;
                }
            }
            case EXPR.UNARY:{
                let v = eval_expr(expr.expr, vars);
                if(v === null) return null;
                switch(expr.utype){
                    case UNARY.PLUS:
                        return v;
                    case UNARY.NOT:
                        return !v? 1 : 0;
                    case UNARY.NEG:
                        return -v;
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
        function parse_line(){
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
                    return err(token, "Assertion Error");
                case TokenKind.EQUALS:
                    return parse_raw();
                case TokenKind.COLON:
                    return parse_raw();
                case TokenKind.IDENT:

                    if(token.text.toLowerCase() == "roll" || token.text.toLowerCase() == "r")
                        return parse_roll();
                    if(peek_no_space().kind == TokenKind.EQUALS)
                        return parse_assignment();
                    else
                        return parse_raw();
                case TokenKind.PLUS:
                case TokenKind.MINUS:{
                    let k = peek_no_space().kind;
                    if(k == TokenKind.NUMBER || k == TokenKind.DIE)
                        return parse_roll();
                    return parse_raw();
                    }
                case TokenKind.NUMBER:
                case TokenKind.DIE:
                    return parse_roll();
                case TokenKind.IF:
                    return parse_if(indentation);
                case TokenKind.ELSE:
                    return parse_else(indentation);
                case TokenKind.USE:
                    return parse_use();
                case TokenKind.ENDLINE:
                    index++;
                    return;
                case TokenKind.SLASH:{
                    let p = peek_no_space().text.toLowerCase();
                    if(p == "r" || p == "roll")
                        return parse_roll();
                    else
                        return parse_slash();
                }
                case TokenKind.BACKTICK:
                    index++;
                    return parse_raw();
                default:
                    return parse_raw();
            }
        }
        function parse_assignment(){
            const startidx = index;
            function parse_as_raw(){
                index = startidx;
                return parse_raw();
            }
            let ident = take();
            if(ident.kind != TokenKind.IDENT)
                return parse_as_raw();
                // return err(ident, "Assertion error, should've been an ident");
            skip_spaces();
            let equals = take();
            if(equals.kind != TokenKind.EQUALS)
                return parse_as_raw();
                // return err(equals, "Assertion error, should've been an equals");
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
            const startidx = index;
            function parse_as_raw(){
                index = startidx;
                return parse_raw();
            }
            let if_ = take();
            if(if_.kind != TokenKind.IF)
                return parse_as_raw();
                // return err(if_, "Assertion error, should've been if");
            skip_spaces();
            let condtokens = [];
            for(;;){
                let tok = take();
                if(tok.kind == TokenKind.ENDLINE)
                    return parse_as_raw();
                if(tok.kind == TokenKind.COLON)
                    break;
                condtokens.push(tok);
            }
            let expr = parse_expression(condtokens);
            if(!expr) return parse_as_raw();
            skip_spaces();
            let endline = take();
            if(endline.kind != TokenKind.ENDLINE){
                return parse_as_raw();
                // return err(endline, "Need a newline after colon");
            }
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
            const startidx = index;
            function parse_as_raw(){
                index = startidx;
                return parse_raw();
            }
            let else_ = take();
            if(!currentblock.statements.length){
                return parse_as_raw();
                // return err(else_, "No previous if for this else");
            }
            let prev_statement = currentblock.statements[currentblock.statements.length-1];
            if(prev_statement.kind != StatementKind.IF){
                return parse_as_raw();
                // return err(else_, "No previous if for this else");
            }
            if(else_.kind != TokenKind.ELSE)
                return parse_as_raw();
                // return err(else_, "assertion error, must have been an else");
            skip_spaces();
            let col_or_if = take();
            skip_spaces();
            if(col_or_if.kind == TokenKind.COLON){
                let end = take();
                if(end.kind != TokenKind.ENDLINE)
                    return parse_as_raw();
                    // return err(end, "Expected end of line after colon");
                if(prev_statement.iffalse !== null)
                    return parse_as_raw();
                    // return err(else_, "Duplicated else for if statement");
                let newblock= make_block(currentblock, indentation);
                prev_statement.iffalse = newblock;
                currentblock = newblock;
                return;
            }
            if(col_or_if.kind != TokenKind.IF)
                return parse_as_raw();
                // return err(col_or_if, "Must be a colon or an if");
            let condtokens = [];
            for(;;){
                let tok = take();
                if(tok.kind == TokenKind.ENDLINE)
                    return parse_as_raw();
                if(tok.kind == TokenKind.COLON)
                    break;
                condtokens.push(tok);
            }
            let expr = parse_expression(condtokens);
            if(!expr) return parse_as_raw();
            skip_spaces();
            let end = take();
            if(end.kind != TokenKind.ENDLINE)
                return parse_as_raw();
                // return err(end, "Expected end of line after the colon after an if expression");
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
                return parse_raw();
            }
            let use = take();
            if(use.kind != TokenKind.USE){
                return parse_as_raw();
                // return err(use, "Unexpected error, use begins with use");
            }
            skip_spaces();
            let ident = take();
            if(ident.kind != TokenKind.IDENT){
                return parse_as_raw();
                // return err(ident, "Expected an identifier for the target of the use statement");
            }
            skip_spaces();
            let end = take();
            if(end.kind != TokenKind.ENDLINE){
                return parse_as_raw();
                // return err(end, "Expected endline after identifier of use");
            }
            let usestatement:UseStatement = {
                kind: StatementKind.USE,
                name: ident,
            };
            currentblock.statements.push(usestatement);
        }
        function parse_slash(){
            let tok = take();
            if(tok.kind != TokenKind.SLASH){
                index--;
                return parse_raw();
            }
            let postslash = take();
            let slash: SlashStatement = {
                kind: StatementKind.SLASH,
                first: postslash,
                content: [],
            };
            for(;;){
                let tok = take();
                if(tok.kind == TokenKind.ENDLINE)
                    break;
                slash.content.push(tok);
            }
            currentblock.statements.push(slash);
        }
        function parse_raw(){
            let raw: RawStatement = {
                kind: StatementKind.RAW,
                content: [],
            };
            for(;;){
                let tok = take();
                if(tok.kind == TokenKind.ENDLINE)
                    break;
                raw.content.push(tok);
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

    function interpret(statement:Statement, vars:Map<string, Array<Token>>, namespaces:Map<string, Map<string, Array<Token>>>, outlines:Array<string>):string{
        switch(statement.kind){
            case StatementKind.RAW:{
                let s = "";
                for(let tok of statement.content)
                    s += tok.text;
                outlines.push(s);
            }break;
            case StatementKind.SLASH:{
                let s = "/" + statement.first.text;
                for(let tok of statement.content)
                    s += tok.text;
                outlines.push(s);
            }break;
            case StatementKind.ROLL:{
                let s = "";
                for(let tok of statement.contents){
                    if(tok.kind == TokenKind.IDENT)
                        s += expand(vars, tok.text, new Set());
                    else
                        s += tok.text;
                }
                outlines.push(s);
            }break;
            case StatementKind.BLOCK:{
                for(let s of statement.statements)
                    interpret(s, vars, namespaces, outlines);
            }break;
            case StatementKind.IF:{
                if(eval_expr(statement.test, vars)){
                    interpret(statement.iftrue, vars, namespaces, outlines);
                }
                else {
                    let handled = false;
                    for(let elif of statement.elifs){
                        let t2 = eval_expr(elif.test, vars);
                        if(t2){
                            handled = true;
                            interpret(elif.block, vars, namespaces, outlines);
                            break;
                        }
                    }
                    if(!handled && statement.iffalse !== null){
                        interpret(statement.iffalse, vars, namespaces, outlines);
                    }
                }
            }break;
            case StatementKind.ASSIGN:{
                vars.set(statement.lhs.text.toLowerCase(), statement.rhs);
            }break;
            case StatementKind.USE:{
                let ns = namespaces.get(statement.name.text.toLowerCase());
                if(!ns) break;
                for(let [key, value] of ns.entries()){
                    vars.set(key.toLowerCase(), value);
                }
            }break;
        }
        return "";
    }
    function expand(vars:Map<string, Array<Token>>, ident:string, visited:Set<string>):string{
        let toks = expand_tokens(vars, ident, visited);
        let s = ""
        for(let tok of toks){
            s += tok.text;
        }
        return s;
    }
    function expand_tokens(vars:Map<string, Array<Token>>, ident:string, visited:Set<string>):Array<Token>{
        ident = ident.toLowerCase();
        if(visited.has(ident)) return [];
        visited.add(ident);
        let result:Array<Token> = [];
        let v = vars.get(ident);
        if(v !== undefined){
            for(let tok of v){
                if(tok.kind == TokenKind.IDENT){
                    for(let t of expand_tokens(vars, tok.text, visited))
                        result.push(t);
                }
                else {
                    result.push(tok);
                }
            }
        }
        else {
            result.push({kind:TokenKind.IDENT, text:ident});
        }
        return result;
    }

    function really_eval_script(text:string, vars:Map<string, Array<Token>>, namespaces:Map<string, Map<string, Array<Token>>>){
        // const before = performance.now();
        let outlines: Array<string> = [];
        let glob = make_block(null, -1);
        let tokens = tokenize(text);
        let err = parse(tokens, glob);
        if(err !== null) throw new Error(err);
        let err2 = interpret(glob, vars, namespaces, outlines);
        if(err2.length) throw new Error(err2);
        // const after = performance.now();
        // outlines.push(`Parsing took: ${after-before}ms`);
        return outlines;
    }

    function eval_script(text:string, vars:Map<string, number|string>, namespaces:Map<string, Map<string,number|string>>): Array<string> {
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
        return really_eval_script(text, newvars, newnamespaces);
    }
    return eval_script;
})();
