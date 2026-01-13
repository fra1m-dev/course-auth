import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  BaseEntity,
} from 'typeorm';

@Entity({ name: 'token' })
export class TokenEntity extends BaseEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 512, unique: true, nullable: true })
  token!: string | null;

  @Index({ unique: true })
  @Column({ type: 'int' })
  userId!: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  passwordHash!: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
