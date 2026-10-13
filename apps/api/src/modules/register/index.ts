// Public surface of the register module. Other modules import only from here.
export { RegisterModule } from './register.module';
export { RegisterService } from './application/register.service';
export type { NewRegisterEntry, RegisterEntry } from './domain/register-entry';
