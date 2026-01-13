export enum Role {
  USER = 'user',
  STUDENT = 'student',
  ADMIN = 'admin',
  TEACHER = 'teacher',
}

export type UserModel = {
  id: number;
  email: string;
  name: string;
  role: Role;
  specializationId: number;
};
