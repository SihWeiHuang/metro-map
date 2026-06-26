/** @typedef {{ file: string, labelKey: string }} TutorialVideo */

/** @typedef {{ id: string, titleKey: string, introKey: string, videos: TutorialVideo[] }} TutorialPage */

/** @type {TutorialPage[]} */
export const TUTORIAL_PAGES = [
  {
    id: "edit-nodes",
    titleKey: "tutorial.page1.title",
    introKey: "tutorial.page1.intro",
    videos: [
      { file: "1新增節點.mov", labelKey: "tutorial.video.addNode" },
      { file: "2拖曳節點.mov", labelKey: "tutorial.video.dragNode" },
      { file: "3刪除節點.mov", labelKey: "tutorial.video.deleteNode" },
      { file: "4新增節點.mov", labelKey: "tutorial.video.addNodeOnDraftRoute" },
    ],
  },
  {
    id: "edit-stations",
    titleKey: "tutorial.page2.title",
    introKey: "tutorial.page2.intro",
    videos: [
      { file: "5新增車站.mov", labelKey: "tutorial.video.addStation" },
      { file: "6拖曳移動車站.mov", labelKey: "tutorial.video.dragStation" },
      { file: "7編輯轉乘站.mov", labelKey: "tutorial.video.editTransfer" },
      { file: "8移動車站名稱.mov", labelKey: "tutorial.video.moveStationLabel" },
    ],
  },
  {
    id: "edit-routes",
    titleKey: "tutorial.page3.title",
    introKey: "tutorial.page3.intro",
    videos: [
      { file: "9編輯既有路線.mov", labelKey: "tutorial.video.editExistingRoute" },
      { file: "10合併路線.mov", labelKey: "tutorial.video.mergeRoutes" },
      { file: "11解散路線.mov", labelKey: "tutorial.video.splitRoute" },
    ],
  },
  {
    id: "manage-routes",
    titleKey: "tutorial.page4.title",
    introKey: "tutorial.page4.intro",
    videos: [
      { file: "12刪除路線.mov", labelKey: "tutorial.video.deleteRoute" },
      { file: "13更改路線顏色.mov", labelKey: "tutorial.video.changeRouteColor" },
      { file: "14更改路線名稱.mov", labelKey: "tutorial.video.changeRouteName" },
    ],
  },
];

/** @param {string} file */
export function tutorialVideoUrl(file) {
  return `/tutorial/${encodeURIComponent(file)}`;
}
