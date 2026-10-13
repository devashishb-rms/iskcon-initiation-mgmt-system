import { Global, Module } from '@nestjs/common';
import { Sealer } from './sealer';

@Global()
@Module({ providers: [Sealer], exports: [Sealer] })
export class SecurityModule {}
