import {emailSelector} from '@selectors/Session';
import React, {useCallback, useRef} from 'react';
import {Platform} from 'react-native';
import type {WebViewMessageEvent, WebViewNavigation} from 'react-native-webview';
import {WebView} from 'react-native-webview';
import type {ValueOf} from 'type-fest';
import FullScreenLoadingIndicator from '@components/FullscreenLoadingIndicator';
import useLocalize from '@hooks/useLocalize';
import useOnyx from '@hooks/useOnyx';
import * as Link from '@libs/actions/Link';
import fileDownload from '@libs/fileDownload';
import type CONST from '@src/CONST';
import ONYXKEYS from '@src/ONYXKEYS';
import type {WalletStatementProps} from './types';
import handleWalletStatementNavigation from './walletNavigationUtils';

type WebViewMessageType = ValueOf<typeof CONST.WALLET.WEB_MESSAGE_TYPE>;

type WalletStatementWebViewNavigationEvent = WebViewNavigation & {type?: WebViewMessageType};

const renderLoading = () => <FullScreenLoadingIndicator />;

const parseURL = (url: string, baseURL?: string) => {
    try {
        return new URL(url, baseURL);
    } catch {
        return null;
    }
};

const shouldHandleDownload = (url: string, statementPageURL: string) => parseURL(url, statementPageURL)?.searchParams.get('secureType') === 'pdfreport';

const getDownloadFileName = (url: string, statementPageURL: string) => {
    const searchParams = parseURL(url, statementPageURL)?.searchParams;
    return searchParams?.get('downloadName') ?? searchParams?.get('filename') ?? 'Expensify_Statement.pdf';
};

const addAuthParamsToDownloadURL = (url: string, statementPageURL: string, authToken?: string, encryptedAuthToken?: string, email?: string) => {
    const parsedUrl = parseURL(url, statementPageURL);
    if (!parsedUrl) {
        return '';
    }

    if (email && !parsedUrl.searchParams.get('email')) {
        parsedUrl.searchParams.set('email', email);
    }

    if (authToken && !parsedUrl.searchParams.get('authToken')) {
        parsedUrl.searchParams.set('authToken', authToken);
    }

    if (encryptedAuthToken && !parsedUrl.searchParams.get('encryptedAuthToken')) {
        parsedUrl.searchParams.set('encryptedAuthToken', encryptedAuthToken);
    }

    return parsedUrl.toString();
};

function WalletStatementModal({statementPageURL}: WalletStatementProps) {
    const {translate} = useLocalize();
    const [session] = useOnyx(ONYXKEYS.SESSION, {canBeMissing: true});
    const [currentUserLogin] = useOnyx(ONYXKEYS.SESSION, {selector: emailSelector});
    const webViewRef = useRef<WebView>(null);
    const authToken = session?.authToken ?? null;

    const [conciergeReportID] = useOnyx(ONYXKEYS.CONCIERGE_REPORT_ID, {canBeMissing: true});
    const onShouldStartLoadWithRequest = useCallback(
        (event: WebViewNavigation) => {
            const {url} = event;
            if (!url || !shouldHandleDownload(url, statementPageURL)) {
                return true;
            }

            const fileName = getDownloadFileName(url, statementPageURL);
            const urlWithAuth = addAuthParamsToDownloadURL(url, statementPageURL, session?.authToken, session?.encryptedAuthToken, currentUserLogin);
            if (!urlWithAuth) {
                return true;
            }

            if (Platform.OS === 'ios') {
                Link.openExternalLink(urlWithAuth, true);
                return false;
            }

            fileDownload(translate, urlWithAuth, fileName, '', false, undefined, undefined, () => Link.openExternalLink(urlWithAuth, true));
            return false;
        },
        [currentUserLogin, session?.authToken, session?.encryptedAuthToken, statementPageURL, translate],
    );
    const onMessage = useCallback(
        (event: WebViewMessageEvent) => {
            try {
                const parsedData = JSON.parse(event.nativeEvent.data) as WalletStatementWebViewNavigationEvent;
                const {type, url} = parsedData || {};
                if (!webViewRef.current) {
                    return;
                }

                handleWalletStatementNavigation(conciergeReportID, type, url);
            } catch (error) {
                console.error('Error parsing message from WebView:', error);
            }
        },
        [conciergeReportID],
    );

    return (
        <WebView
            ref={webViewRef}
            originWhitelist={['https://*']}
            source={{
                uri: statementPageURL,
                headers: {
                    Cookie: `authToken=${authToken}`,
                },
            }}
            incognito // 'incognito' prop required for Android, issue here https://github.com/react-native-webview/react-native-webview/issues/1352
            startInLoadingState
            renderLoading={renderLoading}
            onMessage={onMessage}
            onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
        />
    );
}

export default WalletStatementModal;
