import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Lecture } from './lecture.entity';
import { LectureAssetKind } from '../enums/lecture-asset-kind.enum';

/**
 * One file belonging to a lecture: its presentation, its video or its tile
 * image. The bytes live in object storage; this row is the pointer and
 * everything we know about them.
 *
 * `objectKey` is assigned by the server and never by the client. It is the only
 * thing standing between "upload a file" and "write anywhere in the bucket".
 */
@Entity('lecture_assets')
@Index('UQ_lecture_assets_lecture_kind', ['lectureId', 'kind'], { unique: true })
export class LectureAsset {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  lectureId!: string;

  @ManyToOne(() => Lecture, (lecture) => lecture.assets, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lectureId' })
  lecture!: Lecture;

  @Column({ type: 'enum', enum: LectureAssetKind })
  kind!: LectureAssetKind;

  /** Path inside the bucket. Server-generated; see the note on this class. */
  @Column({ length: 500 })
  objectKey!: string;

  /** What the author called it, for the download name and for the form. */
  @Column({ length: 300 })
  fileName!: string;

  @Column({ length: 150 })
  contentType!: string;

  @Column({ type: 'bigint' })
  sizeBytes!: string;

  /**
   * Null until the bytes are confirmed to be in the bucket. A row with no
   * `uploadedAt` is a promise the browser made and may not have kept, so
   * nothing reads it.
   */
  @Column({ type: 'timestamptz', nullable: true })
  uploadedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
