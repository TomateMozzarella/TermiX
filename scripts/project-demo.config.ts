import {defineConfig} from '@playwright/test';
import base from '../playwright.config';
export default defineConfig({...base,globalTeardown:'./stop-preview.mjs',webServer:{...base.webServer,cwd:process.cwd()},testDir:'.',testMatch:'project-demo.spec.ts',workers:1,use:{...base.use,viewport:{width:1280,height:800}}});
