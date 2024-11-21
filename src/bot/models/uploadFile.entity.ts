import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

import { TABLE } from '../constants/table';
import { FileType } from '../constants/configs';

@Index(['file_type', 'episode'])
@Entity(TABLE.UPLOADFILE)
export class Uploadfile {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text' })
  filePath: string;

  @Column({ type: 'text' })
  fileName: string;

  @Column({ type: 'decimal', nullable: true })
  createTimestamp: number;

  @Column({ nullable: true })
  episode: number;

  @Column({ type: 'varchar', nullable: true })
  file_type: FileType;
}
