/**
 * Listing-matching test for the Windows folder-access helper.
 *
 * The listings below reproduce the shapes real `icacls` output has on this
 * machine: the first line is prefixed with the directory path (which contains a
 * colon and here contains the account name too), inherited ACEs print `(I)` or
 * `(I)(OI)(CI)(IO)`, a deny prints `(DENY)`, and the label ACE's principal
 * contains spaces.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readPrincipalControl as read } from '../lib/index.js'

const USER = 'DESKTOP-3M4K323\\CHEN'
const OK = 'Successfully processed 1 files; Failed processing 0 files.'

test('effective full control counts, explicit or inherited', () => {
  assert.equal(read(`C:\\dir ${USER}:(F)\r\n\r\n${OK}\r\n`, USER), 'full-control')
  // continuation line (no path prefix), and the account printed lower-cased
  assert.equal(read('            desktop-3m4k323\\chen:(F)\n', USER), 'full-control')
  // a normal volume's inheritance: the account's own full control is inherited,
  // which conveys the same WRITE_DAC/WRITE_OWNER an explicit ACE does
  assert.equal(read(`C:\\dir ${USER}:(I)(OI)(CI)(F)\n`, USER), 'full-control')
})

test('an account name containing a space is still that account', () => {
  // `icacls` leaves the account a blank column, so the principal cannot be read
  // with a no-whitespace character class.
  const spaced = 'CONTOSO\\John Doe'
  assert.equal(read('C:\\x CONTOSO\\John Doe:(F)\r\n', spaced), 'full-control')
  assert.equal(read('C:\\x CONTOSO\\John Doe:(I)(OI)(CI)(F)\r\n', spaced), 'full-control')
  assert.equal(read('C:\\x CONTOSO\\John Doe:(OI)(CI)(M)\r\n', spaced), 'absent')
  assert.equal(read('C:\\x CONTOSO\\John Doe:(F)\r\n', USER), 'absent')
})

test('inherit-only ACEs do not apply to the object itself', () => {
  // `(IO)` means "not on this object": crediting it would skip the very repair
  // that makes the folder provisionable, leaving the chat broken.
  assert.equal(read(`C:\\dir ${USER}:(OI)(CI)(IO)(F)\n`, USER), 'absent')
  assert.equal(read(`C:\\dir ${USER}:(I)(OI)(CI)(IO)(F)\n`, USER), 'absent')
  // the real inheritance pair seen on E:\-rooted folders: no full control there
  assert.equal(read(`C:\\dir ${USER}:(I)(OI)(CI)(IO)(M)\n`, USER), 'absent')
})

test('a deny for the same account wins over an allow', () => {
  assert.equal(read(`X ${USER}:(F)\r\nX ${USER}:(DENY)(F)\r\n`, USER), 'denied')
  assert.equal(read(`X ${USER}:(DENY)(WO)\r\n`, USER), 'denied')
  // a deny of an unrelated right is not what blocks provisioning
  assert.equal(read(`X ${USER}:(DENY)(DC)\r\n`, USER), 'absent')
  assert.equal(read(`X ${USER}:(DENY)(DC)\r\nX ${USER}:(F)\r\n`, USER), 'full-control')
  // somebody else's deny never counts, not even Everyone's (DSH writes one)
  assert.equal(read(`X Everyone:(CI)(DENY)(DC)\r\nX ${USER}:(F)\r\n`, USER), 'full-control')
})

test('inherited or weaker ACEs alone do not count as provisionable', () => {
  assert.equal(read(`C:\\dir ${USER}:(OI)(CI)(M)\n`, USER), 'absent')
  assert.equal(read(`C:\\dir DOMAIN\\someone-else:(OI)(CI)(F)\n`, USER), 'absent')
  assert.equal(read('', USER), 'absent')
})

test('a deny-heavy real listing resolves per account', () => {
  // Real shape on a chat folder DSH already provisioned.
  const listing = [
    'D:\\work\\2026-10-07 Everyone:(CI)(DENY)(DC)',
    '                            S-1-4-607921594-374798482:(OI)(CI)(W,D,DC)',
    `                            ${USER}:(F)`,
    '                            BUILTIN\\Administrators:(I)(F)',
    '                            Mandatory Label\\Low Mandatory Level:(OI)(CI)(NW)',
    '',
    OK,
  ].join('\r\n')
  assert.equal(read(listing, USER), 'full-control')
  assert.equal(read(listing.replace(`${USER}:(F)`, `${USER}:(CI)(DENY)(F)`), USER), 'denied')
})

test('a directory path containing the account name cannot credit another account', () => {
  // A Windows profile path carries the account name, so the listing's path prefix
  // does too; a line-wide search would read the *other* account's full-control
  // ACE as ours.
  assert.equal(read(`C:\\Users\\${USER}\\x DOMAIN\\someone-else:(OI)(CI)(F)\r\n`, USER), 'absent')
  assert.equal(read(`C:\\Users\\${USER}\\x ${USER}:(F)\r\n`, USER), 'full-control')
})

test('a listing that only has the account inherited stays provisionable', () => {
  const listing = [
    `C:\\Temp\\${USER}\\root DESKTOP-3M4K323\\CodexSandboxUsers:(OI)(CI)(M)`,
    `                                                  ${USER}:(I)(OI)(CI)(F)`,
    '                                                  NT AUTHORITY\\SYSTEM:(I)(OI)(CI)(F)',
    '',
    OK,
  ].join('\r\n')
  assert.equal(read(listing, USER), 'full-control')
})
