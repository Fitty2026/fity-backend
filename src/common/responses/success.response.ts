export class SuccessResponse {
  constructor(
    public code: string,
    public message: string,
    public result: any
  ) {}
}