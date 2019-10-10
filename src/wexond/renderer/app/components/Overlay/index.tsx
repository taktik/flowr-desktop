import { observer } from 'mobx-react';
import * as React from 'react';

import store from '../../store';
import {
  StyledOverlay,
  HeaderText,
  HeaderArrow,
  Scrollable,
  Title,
  Content,
  Container,
  Handle,
} from './style';
import { SearchBox } from '../SearchBox';
import { TabGroups } from '../TabGroups';
import { TabsList } from '../TabsList';
import { WeatherCard } from '../WeatherCard';
import { History } from '../History';
import { Bookmarks } from '../Bookmarks';
import { Dial } from '../Dial';
import { QuickMenu } from '../QuickMenu';
import { DownloadsSection } from '../DownloadsSection';

export const Header = ({ children, clickable }: any) => {
  return (
    <HeaderText clickable={clickable}>
      {children}
      {clickable && <HeaderArrow />}
    </HeaderText>
  );
};

export const preventHiding = (e: any) => {
  e.stopPropagation();
  store.overlay.dialTypeMenuVisible = false;
};

export const Overlay = observer(() => {
  return (
    <StyledOverlay visible={store.overlay.visible}>
      <Handle visible={store.overlay.visible} />
      <Container
        visible={
          store.overlay.currentContent === 'default' && store.overlay.visible
        }
      >
        <Scrollable ref={store.overlay.scrollRef}>
          <Content>
            <SearchBox />
            <Dial />
            <QuickMenu />
          </Content>
        </Scrollable>
      </Container>
      <History />
      <Bookmarks />
    </StyledOverlay>
  );
});
