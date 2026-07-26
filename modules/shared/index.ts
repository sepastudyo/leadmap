/**
 * Domain primitives shared across modules: error types, result/either
 * wrappers, and other framework-free building blocks (architecture.md §4).
 */
export class EmailAlreadyExistsError extends Error {
  constructor() {
    super("A user with this email already exists.");
    this.name = "EmailAlreadyExistsError";
  }
}
