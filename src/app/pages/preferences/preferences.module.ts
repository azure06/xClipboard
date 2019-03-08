import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';

import { IonicModule } from '@ionic/angular';

import { PreferencesPage } from './preferences.page';
import { PreferencesPageRoutingModule } from './preferences.router.module';

const routes: Routes = [
  {
    path: '',
    component: PreferencesPage
  }
];

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    PreferencesPageRoutingModule,
    RouterModule.forChild(routes)
  ],
  declarations: [PreferencesPage]
})
export class PreferencesPageModule {}
