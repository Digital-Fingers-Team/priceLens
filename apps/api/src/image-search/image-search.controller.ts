import { Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { CurrentUser } from '../common/decorators';
import { FEATURES } from '../billing/plan-limits';
import { RequiresFeature } from '../billing/requires-feature.decorator';
import { ImageSearchService, MAX_IMAGE_BYTES, UploadedImage } from './image-search.service';

@ApiTags('search')
@Controller('search')
export class ImageSearchController {
  constructor(private readonly imageSearch: ImageSearchService) {}

  /** Multipart field "image". Answers what it recognised and the search to run. */
  @RequiresFeature(FEATURES.IMAGE_SEARCH)
  @Post('image')
  @ApiConsumes('multipart/form-data')
  // No storage option: Nest keeps the upload in memory (file.buffer), never on disk.
  @UseInterceptors(FileInterceptor('image', { limits: { fileSize: MAX_IMAGE_BYTES, files: 1 } }))
  recognise(@CurrentUser() user: User, @UploadedFile() image: UploadedImage | undefined) {
    return this.imageSearch.recognise(user.id, image);
  }
}
