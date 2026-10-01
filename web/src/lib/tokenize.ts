export type TokenType =
  | 'comment'
  | 'directive'
  | 'variable'
  | 'string'
  | 'number'
  | 'punct'
  | 'text'

export interface Token {
  type: TokenType
  text: string
}

const PATTERN =
  /(?<space>\s+)|(?<comment>#.*$)|(?<string>"(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?)|(?<variable>\$\{?[A-Za-z_][A-Za-z0-9_]*\}?)|(?<punct>[{};])|(?<number>\b\d+(?:\.\d+)?[a-zA-Z]{0,2}\b(?![-./\w]))|(?<word>[^\s{};"'#$]+|\$)/gy

// Tokenizes one line of generated NGINX configuration. The first word of a statement
// is the directive name; everything the renderer emits follows that shape.
export function tokenizeLine(line: string): Token[] {
  const tokens: Token[] = []
  let atStatementStart = true
  PATTERN.lastIndex = 0

  while (PATTERN.lastIndex < line.length) {
    const match = PATTERN.exec(line)
    if (match === null || match.groups === undefined) {
      tokens.push({ type: 'text', text: line.slice(PATTERN.lastIndex) })
      break
    }

    const groups = match.groups
    const text = match[0]

    if (groups.space !== undefined) {
      tokens.push({ type: 'text', text })
    } else if (groups.comment !== undefined) {
      tokens.push({ type: 'comment', text })
    } else if (groups.string !== undefined) {
      tokens.push({ type: 'string', text })
      atStatementStart = false
    } else if (groups.variable !== undefined) {
      tokens.push({ type: 'variable', text })
      atStatementStart = false
    } else if (groups.punct !== undefined) {
      tokens.push({ type: 'punct', text })
      atStatementStart = text === '{' || text === ';'
    } else if (groups.number !== undefined && !atStatementStart) {
      tokens.push({ type: 'number', text })
    } else {
      tokens.push({ type: atStatementStart ? 'directive' : 'text', text })
      atStatementStart = false
    }
  }

  return tokens
}
