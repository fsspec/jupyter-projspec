import { requestAPI } from './request';

interface IMakeResponse {
  stdout: string;
  stderr: string;
  returncode: number;
}

export async function make(command: string): Promise<IMakeResponse> {
  return await requestAPI<IMakeResponse>('make', {
    method: 'POST',
    body: JSON.stringify({ command })
  });
}
