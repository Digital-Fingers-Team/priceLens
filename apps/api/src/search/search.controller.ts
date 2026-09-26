import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators';
import { SearchService } from './search.service';
import { SearchQueryDto, SuggestQueryDto } from './dto/search.dto';

@ApiTags('search')
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Search products; a query also queues a live scrape of it' })
  search(@Query() query: SearchQueryDto) {
    return this.searchService.search(query);
  }

  @Public()
  @Get('suggest')
  @ApiOperation({ summary: 'Type-ahead suggestions (2+ characters)' })
  suggest(@Query() query: SuggestQueryDto) {
    return this.searchService.suggest(query);
  }
}
