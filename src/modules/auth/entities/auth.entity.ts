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

  @Column({ type: 'varchar', length: 512, unique: true })
  token!: string;

  @Index()
  @Column({ type: 'varchar', length: 64 })
  userId!: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
