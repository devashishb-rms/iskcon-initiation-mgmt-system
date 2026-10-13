// Public surface of the documents module. Other modules import only from here.
export { DocumentsModule } from './documents.module';
export { DocumentsService, type ExportableDocument, type IncomingFile } from './application/documents.service';
export { VirusScanner, type ScanResult } from './application/virus-scanner';
