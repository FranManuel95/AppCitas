// Error de dominio: mensaje seguro para mostrar al usuario + código HTTP.
export class DomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly httpStatus = 400,
  ) {
    super(message);
    this.name = "DomainError";
  }
}
