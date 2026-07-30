import axios, { AxiosInstance } from 'axios';
import { DoRequestDto, StepResultDto, UndoRequestDto } from '@order-system/shared-types';

/**
 * Thin HTTP wrapper around one step service's /do and /undo endpoints. A thrown
 * error here means a transport-level failure (network error or the timeout below) -
 * that's the signal the caller should retry on. A resolved StepResultDto with
 * outcome: FAILURE is a business decision the step service already made permanently,
 * which the caller should record as-is rather than retry.
 */
export class StepClient {
  private readonly http: AxiosInstance;

  constructor(baseURL: string, timeoutMs = 5000) {
    this.http = axios.create({ baseURL, timeout: timeoutMs });
  }

  async do(payload: DoRequestDto): Promise<StepResultDto> {
    const res = await this.http.post<StepResultDto>('/do', payload);
    return res.data;
  }

  async undo(payload: UndoRequestDto): Promise<StepResultDto> {
    const res = await this.http.post<StepResultDto>('/undo', payload);
    return res.data;
  }
}
