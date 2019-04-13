import { Component, OnInit, ViewChild } from '@angular/core';
import { IonInfiniteScroll, NavController } from '@ionic/angular';
import { select, Store } from '@ngrx/store';
import moment from 'moment';
import { Observable } from 'rxjs';
import { delay, filter, first, map, tap } from 'rxjs/operators';
import { Clip } from '../../models/models';
import { GoogleTranslateService } from '../../services/google-translate/google-translate.service';
import { QuillCardServiceModule } from '../../services/quill-cards/quill-cards.module';
import { QuillCardsService } from '../../services/quill-cards/quill-cards.service';
import * as fromClips from '../clipboard/store/index';
import { ClipboardService } from './../../services/clipboard/clipboard.service';

@Component({
  selector: 'app-clipboard-bookmark',
  templateUrl: './clipboard-bookmark.page.html',
  styleUrls: ['./clipboard-bookmark.page.scss']
})
export class ClipboardBookmarkPage {
  @ViewChild(IonInfiniteScroll) infiniteScroll: IonInfiniteScroll;
  clips$: Observable<Clip[]>;
  loading: boolean;

  constructor(
    private clipboardService: ClipboardService,
    private googleTranslateService: GoogleTranslateService,
    private quillCardsService: QuillCardsService,
    private store: Store<fromClips.State>,
    private navCtrl: NavController
  ) {}

  async ionViewWillEnter(): Promise<void> {
    this.loading = true;
    await this.clipboardService.getClipsFromIdbAndSetInState({
      limit: 15,
      index: 'category',
      keyRange: IDBKeyRange.upperBound(['starred', ''])
    });
    this.clips$ = this.store.pipe(
      select(fromClips.getClips),
      delay(0),
      map(clips => {
        return clips.reduce((acc: Clip[], clip) => {
          if (clip.category === 'starred') {
            clip.plainView = clip.plainText.substring(0, 255);
            clip.dateFromNow = moment(clip.updatedAt).fromNow();
            acc.push(clip);
          }
          return acc;
        }, []);
      }),
      tap(() => (this.loading = false))
    );
  }

  async loadMore(event): Promise<void> {
    this.clipboardService.loadNext({
      limit: 10,
      index: 'category',
      keyRange: IDBKeyRange.upperBound(['starred', ''])
    });
    const isLoadingNext = await this.store
      .pipe(
        select(fromClips.isLoadingNext),
        filter(value => !value),
        first()
      )
      .toPromise();
    event.target.complete();
    // if (this.data.length === 1000) {
    // event.target.disabled = true;
    // }
  }

  async editClip(clip: Clip) {
    await this.quillCardsService.addQuillCard({
      title: '',
      plainText: clip.plainText,
      contents: { ops: [{ insert: clip.plainText }] },
      label: '',
      displayOrder: -1,
      updatedAt: new Date().getTime(),
      createdAt: new Date().getTime()
    });
    this.navCtrl.navigateForward('clipboard/editor');
  }

  copyToClipboard(data) {
    this.clipboardService.copyToClipboard(data);
  }

  modifyClip(clip: Clip) {
    this.clipboardService.modifyClip(clip);
  }

  removeClip(clip: Clip) {
    this.clipboardService.removeClip(clip);
  }

  async translateText(clip: Clip): Promise<void> {
    this.modifyClip({
      ...clip,
      translationView: await this.googleTranslateService.translate(
        clip.plainText
      )
    });
  }
}
