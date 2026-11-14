import { Course, User } from './types';

export const DEFAULT_ADMIN_USER: User = {
  hoTen: 'Administrator',
  chiDoan: 'BGH',
  idUser: 'admin.c2thuongphuoc',
  role: 'ADMIN',
  isFirstLogin: false,
};

export const DEFAULT_COURSES: Course[] = [];
