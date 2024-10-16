import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateFileType1727949471022 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            UPDATE "komu_uploadFile" 
            SET "file_type" = 'ncc8' 
            WHERE "file_type" IS NULL
          `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            UPDATE "komu_uploadFile" 
            SET "file_type" = NULL 
            WHERE "file_type" = 'ncc8'
          `);
  }
}
