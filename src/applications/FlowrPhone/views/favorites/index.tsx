import * as React from 'react'
import { ClickableIcon } from '../clickableIcon'
import { CallingNumber } from '../phone'
import styled from 'styled-components'
import { Translator } from 'src/translator/translator'
import { FavoritesElement } from './favoritesElement'
import './favorites.css'
import { AddFavorite } from './addFavorite'

interface FavoritesProps {
  favorites: CallingNumber[]
  translator: Translator
  lang?: string
  select: (phoneNumber: CallingNumber) => void
  remove: (phoneNumber: CallingNumber) => void
  save: (phoneNumber: CallingNumber) => void
  openKeyboard?: () => void
  closeKeyboard?: () => void
  applyExternalPhoneNumberPrefix?: boolean
}

enum FavoritesRoute { LIST, ADD }

interface FavoritesState {
  route: FavoritesRoute
  editName?: string
  editValue?: string
}

const StyledIcon = styled(ClickableIcon)`
  width: 24px;
`

export class FavoritesView extends React.Component<FavoritesProps, FavoritesState> {
  constructor(props: FavoritesProps) {
    super(props)
    this.state = { route: FavoritesRoute.LIST, editName: '', editValue: '' }
  }

  save(phoneNumber: CallingNumber): void {
    this.props.save(phoneNumber)
    this.listRoute()
  }

  edit(phoneNumber: CallingNumber): void {
    this.setState({ editName: phoneNumber.name, editValue: phoneNumber.value })
    this.addRoute()
  }

  back(): void {
    this.props.select({ value: '' })
  }

  listRoute(): void {
    this.setState({ route: FavoritesRoute.LIST, editName: '', editValue: '' })
  }

  addRoute(): void {
    this.setState({ route: FavoritesRoute.ADD })
  }

  listPage(): JSX.Element {
    const sortedFavorites = [...this.props.favorites].sort((a, b) => a.name.localeCompare(b.name))
    return (
      <div className="favorites-container">
        <div className="favorites-btn-container">
          <div onClick={this.addRoute.bind(this)}>
            <StyledIcon className="extra-btn-icon" icon="user-plus" onClick={this.addRoute.bind(this)} />
            <span>{this.props.translator.translate('Add', this.props.lang)}</span>
          </div>
          <div onClick={this.back.bind(this)}>
            <StyledIcon className="extra-btn-icon" icon="arrow-left" onClick={this.back.bind(this)} />
            <span>{this.props.translator.translate('Back', this.props.lang)}</span>
          </div>
        </div>
        {
          sortedFavorites.map(favorite => (<FavoritesElement favorite={favorite} select={this.props.select} remove={this.props.remove} edit={this.edit.bind(this)} key={`${favorite.name}-${favorite.value}`}></FavoritesElement>))
        }
      </div>
    )
  }

  addPage(): JSX.Element {
    return (
      <div className="favorites-container">
        <div className="backbtn" onClick={this.listRoute.bind(this)}>
          <StyledIcon className="extra-btn-icon" icon="arrow-left" onClick={this.listRoute.bind(this)} />
          <span>{this.props.translator.translate('Back', this.props.lang)}</span>
        </div>
        <AddFavorite
          name={this.state.editName}
          value={this.state.editValue}
          translator={this.props.translator}
          lang={this.props.lang}
          save={this.save.bind(this)}
          back={this.listRoute.bind(this)}
          openKeyboard={this.props.openKeyboard}
          closeKeyboard={this.props.closeKeyboard}
          applyExternalPhoneNumberPrefix={this.props.applyExternalPhoneNumberPrefix}
        ></AddFavorite>
      </div>
    )
  }

  render(): JSX.Element {
    if (this.state.route === FavoritesRoute.ADD) {
      return this.addPage()
    }
    return this.listPage()
  }
}
