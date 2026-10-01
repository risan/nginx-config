import { describe, expect, it } from 'vitest'

import { tokenizeLine, type Token } from '../../src/lib/tokenize.ts'

function kinds(line: string): [string, string][] {
  return tokenizeLine(line)
    .filter((token: Token) => token.text.trim() !== '')
    .map((token) => [token.type, token.text])
}

describe('tokenizeLine', () => {
  it('marks a whole-line comment', () => {
    expect(kinds('    # keep alive')).toEqual([['comment', '# keep alive']])
  })

  it('marks the directive name, a number with unit and the semicolon', () => {
    expect(kinds('    client_body_timeout 60s;')).toEqual([
      ['directive', 'client_body_timeout'],
      ['number', '60s'],
      ['punct', ';'],
    ])
  })

  it('marks variables, including braces form', () => {
    expect(kinds('return 308 https://$host${request_uri};')).toEqual([
      ['directive', 'return'],
      ['number', '308'],
      ['text', 'https://'],
      ['variable', '$host'],
      ['variable', '${request_uri}'],
      ['punct', ';'],
    ])
  })

  it('marks quoted strings and keeps a trailing comment', () => {
    expect(kinds('add_header X-Frame-Options "SAMEORIGIN" always; # clickjacking')).toEqual([
      ['directive', 'add_header'],
      ['text', 'X-Frame-Options'],
      ['string', '"SAMEORIGIN"'],
      ['text', 'always'],
      ['punct', ';'],
      ['comment', '# clickjacking'],
    ])
  })

  it('treats a block opener as the directive plus braces', () => {
    expect(kinds('location ^~ /assets/ {')).toEqual([
      ['directive', 'location'],
      ['text', '^~'],
      ['text', '/assets/'],
      ['punct', '{'],
    ])
  })

  it('does not treat digits inside a word as a number', () => {
    expect(kinds('listen 127.0.0.1:8080;')).toEqual([
      ['directive', 'listen'],
      ['text', '127.0.0.1:8080'],
      ['punct', ';'],
    ])
  })

  it('does not treat a hash inside a string as a comment', () => {
    expect(kinds("add_header X-A 'a # b';")[2]).toEqual(['string', "'a # b'"])
  })

  it('preserves the original text exactly', () => {
    const line = '        proxy_set_header Host $host;  # why'
    expect(
      tokenizeLine(line)
        .map((token) => token.text)
        .join(''),
    ).toBe(line)
  })

  it('handles an empty line', () => {
    expect(tokenizeLine('')).toEqual([])
  })
})
