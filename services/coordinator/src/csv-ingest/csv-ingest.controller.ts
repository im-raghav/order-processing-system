import * as fs from 'fs';
import * as path from 'path';
import { BadRequestException, Controller, Get, Param, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { CsvIngestService } from './csv-ingest.service';

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

@Controller('api/csv')
export class CsvIngestController {
  constructor(private readonly csvIngestService: CsvIngestService) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: UPLOAD_DIR,
        filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
      }),
    }),
  )
  async upload(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('file is required (multipart field name: "file")');
    const ingestJobId = this.csvIngestService.startIngestion(file.path);
    return { accepted: true, ingestJobId };
  }

  @Get('upload/:ingestJobId/status')
  getStatus(@Param('ingestJobId') ingestJobId: string) {
    return this.csvIngestService.getProgress(ingestJobId);
  }
}
