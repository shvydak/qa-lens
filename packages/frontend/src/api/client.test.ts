import {afterEach, describe, expect, it, vi} from 'vitest'
import {apiFetch} from './client.ts'

afterEach(() => {
  vi.restoreAllMocks()
})

function mockResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as Response
}

describe('apiFetch', () => {
  it('unwraps the { data } envelope on success', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(mockResponse({data: {id: '1', name: 'Alpha'}}))

    const result = await apiFetch<{id: string; name: string}>('GET', '/api/projects')

    expect(result).toEqual({id: '1', name: 'Alpha'})
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/projects'),
      expect.objectContaining({method: 'GET'})
    )
  })

  it('serializes a JSON body for mutations', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(mockResponse({data: {ok: true}}))

    await apiFetch('POST', '/api/projects', {name: 'Beta'})

    const init = fetchMock.mock.calls[0][1]
    expect(init).toMatchObject({
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({name: 'Beta'}),
    })
  })

  it('throws the server error message on a non-ok response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockResponse({error: 'name is required'}, false, 400)
    )

    await expect(apiFetch('POST', '/api/projects', {})).rejects.toThrow('name is required')
  })

  it('falls back to the HTTP status when no error message is given', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse({}, false, 500))

    await expect(apiFetch('GET', '/api/projects')).rejects.toThrow('HTTP 500')
  })
})
