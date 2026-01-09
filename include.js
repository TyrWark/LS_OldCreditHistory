(function () {
	'use strict';

	const getAccountId = () => window.merchantos?.account?.id;
	const getCustomerId = () => new URL(window.location.href).searchParams.get('id');
	const getCreditAccountId = () => window.customerCreditInfo?.creditAccoutnID ?? window.customerCreditInfo?.creditAccountID;
	const getCreditAccountRef = () => {
		const raw = getCreditAccountId();
		if (!raw) return null;
		const str = String(raw);
		return str.startsWith('ls-retail_') ? str : `ls-retail_${str}`;
	};
	const extractSaleId = (transactionRef) => {
		if (!transactionRef) return null;
		const parts = String(transactionRef).split('_');
		const last = parts[parts.length - 1];
		return /^\d+$/.test(last) ? last : null;
	};

	const addTableToggle = (table, limit = 15) => {
		const rows = Array.from(table.querySelectorAll('tr')).slice(1); // skip header
		if (rows.length <= limit) return null;
		const hidden = rows.slice(limit);
		hidden.forEach((tr) => {
			tr.style.display = 'none';
		});
		let expanded = false;
		const toggle = document.createElement('button');
		const updateLabel = () => {
			toggle.textContent = expanded ? `Show first ${limit}` : `Show all (${rows.length})`;
		};
		toggle.addEventListener('click', () => {
			expanded = !expanded;
			hidden.forEach((tr) => {
				tr.style.display = expanded ? '' : 'none';
			});
			updateLabel();
		});
		updateLabel();
		return toggle;
	};

	const buildCustomerUrl = () => {
		const customerId = getCustomerId();
		const accountId = getAccountId();
		if (!accountId) throw new Error('Missing account id');
		return `https://us.merchantos.com/API/Account/${accountId}/Customer/${customerId}.json?load_relations=all`;
	};

	const fetchCustomer = async () => {
		const url = buildCustomerUrl();
		try {
			const response = await fetch(url, { credentials: 'include' });
			if (!response.ok) throw new Error(`Request failed: ${response.status}`);
			const data = await response.json();
			window.latestCustomerData = data;
			const credit = data?.Customer?.CreditAccount || {};
			window.customerCreditInfo = {
				creditLimit: credit.creditLimit ?? null,
				creditAccoutnID: credit.creditAccoutnID ?? credit.creditAccountID ?? null,
				balance: credit.balance ?? null,
			};
			console.log('Fetched customer data:', data);
			console.log('Customer credit info:', window.customerCreditInfo);
			ensureCreditTab();
			showCreditTab();
		} catch (error) {
			console.error('Failed to fetch customer data', error);
		}
	};

	const clearAllTabDisplays = () => {
		document.querySelectorAll('.tabs article.tab').forEach((article) => {
			article.style.removeProperty('display');
		});
	};

	const employeeNameCache = new Map();
	const employeeFetches = new Map();

	const fetchEmployeeName = async (employeeId) => {
		const accountId = getAccountId();
		if (!accountId || !employeeId) throw new Error('Missing account or employee id');
		const url = `https://us.merchantos.com/API/V3/Account/${accountId}/Employee/${employeeId}.json`;
		const response = await fetch(url, {
			method: 'GET',
			credentials: 'include',
			headers: { Accept: 'application/json' },
		});
		if (!response.ok) throw new Error(`Emp fetch failed: ${response.status}`);
		const data = await response.json();
		const emp = data?.Employee;
		const name = [emp?.firstName, emp?.lastName].filter(Boolean).join(' ').trim();
		return name || String(employeeId);
	};

	const resolveEmployeeName = (employeeId, td) => {
		if (!employeeId) {
			td.textContent = '';
			return;
		}
		const accountId = getAccountId();
		const cacheKey = `${accountId || 'na'}:${employeeId}`;
		if (employeeNameCache.has(cacheKey)) {
			td.textContent = employeeNameCache.get(cacheKey);
			return;
		}
		td.textContent = 'Loading...';
		let promise = employeeFetches.get(cacheKey);
		if (!promise) {
			promise = fetchEmployeeName(employeeId)
				.then((name) => {
					employeeNameCache.set(cacheKey, name);
					return name;
				})
				.catch((err) => {
					console.error('Failed to fetch employee', employeeId, err);
					return String(employeeId);
				});
			employeeFetches.set(cacheKey, promise);
		}
		promise.then((name) => {
			td.textContent = name;
		});
	};

	let creditActivityLoading = false;

	const renderCreditActivity = (payments) => {
		const container = document.getElementById('oldCreditsContent');
		if (!container) return;
		container.innerHTML = '';
		if (!payments || !payments.length) {
			container.textContent = 'No withdrawal payments found.';
			return;
		}

		const formatMoney = (val) => {
			const num = Number.parseFloat(val);
			if (Number.isNaN(num)) return val ?? '';
			return `$${num.toFixed(2)}`;
		};

		const formatMoneyCents = (val) => {
			const num = Number.parseFloat(val);
			if (Number.isNaN(num)) return val ?? '';
			return `$${(num / 100).toFixed(2)}`;
		};

		const formatDateTime = (val) => {
			if (!val) return '';
			const d = new Date(val);
			if (Number.isNaN(d.getTime())) return val;
			const mm = String(d.getMonth() + 1).padStart(2, '0');
			const dd = String(d.getDate()).padStart(2, '0');
			const yyyy = d.getFullYear();
			const hh = String(d.getHours()).padStart(2, '0');
			const min = String(d.getMinutes()).padStart(2, '0');
			return `${mm}/${dd}/${yyyy} ${hh}:${min}`;
		};

		const table = document.createElement('table');
		table.style.width = '100%';
		table.style.borderCollapse = 'collapse';

		const headerRow = document.createElement('tr');
		const columns = [
			{ key: 'salePaymentID', label: 'LSPAY', render: (val, row, td) => {
				const displayId = val ?? '';
				if (!displayId) return;
				const paymentId = row?.paymentID || displayId;
				const link = document.createElement('a');
				link.href = `https://us.merchantos.com/reports/payment/retail/${paymentId}`;
				link.textContent = String(displayId);
				link.target = '_blank';
				link.rel = 'noopener noreferrer';
				td.appendChild(link);
			}},
			{ key: 'salePaymentID', label: 'Non LSPAY', render: (val, row, td) => {
				const displayId = val ?? '';
				if (!displayId) return;
				const paymentId = row?.paymentID || displayId;
				const link = document.createElement('a');
				link.href = `https://us.merchantos.com/?name=reports.register.views.payment&form_name=view&id=${paymentId}&tab=details`;
				link.textContent = String(displayId);
				link.target = '_blank';
				link.rel = 'noopener noreferrer';
				td.appendChild(link);
			}},
			{ key: 'amount', label: 'amount', render: (val, _row, td) => { td.textContent = formatMoney(val); } },
			{ key: 'tipAmount', label: 'tipAmount', render: (val, _row, td) => { td.textContent = formatMoney(val); } },
			{ key: 'surchargeAmount', label: 'surchargeAmount', render: (val, _row, td) => { td.textContent = formatMoney(val); } },
			{ key: 'createTime', label: 'createTime', render: (val, _row, td) => { td.textContent = formatDateTime(val); } },
			{ key: 'archived', label: 'archived' },
			{ key: 'saleID', label: 'saleID', render: (val, _row, td) => {
				const saleId = val ?? '';
				if (!saleId) return;
				const link = document.createElement('a');
				link.href = `https://us.merchantos.com/?name=transaction.views.transaction&form_name=view&id=${saleId}&tab=details`;
				link.textContent = String(saleId);
				link.target = '_blank';
				link.rel = 'noopener noreferrer';
				td.appendChild(link);
			}},
			{ key: 'paymentTypeID', label: 'paymentTypeID' },
			{ key: 'registerID', label: 'registerID' },
			{ key: 'employeeID', label: 'employee', render: (val, _row, td) => { resolveEmployeeName(val, td); } },
		];
		columns.forEach(({ label }) => {
			const th = document.createElement('th');
			th.textContent = label;
			th.style.border = '1px solid #ccc';
			th.style.padding = '4px 6px';
			th.style.textAlign = 'left';
			headerRow.appendChild(th);
		});
		table.appendChild(headerRow);

		payments.forEach((p) => {
			const tr = document.createElement('tr');
			columns.forEach(({ key, render }) => {
				const td = document.createElement('td');
				const raw = p?.[key];
				if (render) {
					render(raw, p, td);
				} else {
					td.textContent = raw ?? '';
				}
				td.style.border = '1px solid #eee';
				td.style.padding = '4px 6px';
				tr.appendChild(td);
			});
			table.appendChild(tr);
		});

		container.appendChild(table);

		const toggle = addTableToggle(table, 15);
		if (toggle) {
			const toggleWrap = document.createElement('div');
			toggleWrap.style.marginTop = '6px';
			toggleWrap.appendChild(toggle);
			container.appendChild(toggleWrap);
		}

		const toNumber = (val) => {
			const num = Number.parseFloat(val);
			return Number.isNaN(num) ? 0 : num;
		};
		const totals = payments.reduce(
			(acc, p) => {
				acc.amount += toNumber(p?.amount);
				acc.tipAmount += toNumber(p?.tipAmount);
				acc.surchargeAmount += toNumber(p?.surchargeAmount);
				return acc;
			},
			{ amount: 0, tipAmount: 0, surchargeAmount: 0 }
		);

		const totalsDiv = document.createElement('div');
		totalsDiv.style.marginTop = '8px';
		totalsDiv.textContent = `Totals — Amount: ${formatMoney(totals.amount)}, Tips: ${formatMoney(totals.tipAmount)}, Surcharge: ${formatMoney(totals.surchargeAmount)}`;
		container.appendChild(totalsDiv);

		const creditInfo = window.customerCreditInfo || {};
		const creditLimitNum = toNumber(creditInfo.creditLimit);
		const onDepositNum = toNumber(creditInfo.balance);
		const availableNum = creditLimitNum - onDepositNum;

		const detailsDiv = document.createElement('div');
		detailsDiv.style.marginTop = '6px';
		detailsDiv.innerHTML = `<strong>Credit Account Details</strong><br>Credit Limit: ${formatMoney(creditLimitNum)}<br>On Deposit: ${formatMoney(onDepositNum)}<br>Available: ${Number.isNaN(availableNum) ? '' : formatMoney(availableNum)}`;
		container.appendChild(detailsDiv);


		const invoicesDiv = document.createElement('div');
		invoicesDiv.id = 'oldCreditsInvoices';
		invoicesDiv.style.marginTop = '10px';
		invoicesDiv.textContent = 'Loading invoices...';
		container.appendChild(invoicesDiv);
		fetchInvoices(invoicesDiv, formatMoneyCents, formatDateTime);

		const memosDiv = document.createElement('div');
		memosDiv.id = 'oldCreditsCreditMemos';
		memosDiv.style.marginTop = '10px';
		memosDiv.textContent = 'Loading credit memos...';
		container.appendChild(memosDiv);
		fetchCreditMemos(memosDiv, formatMoneyCents, formatDateTime);
	};

	const fetchInvoices = async (targetDiv, moneyFormatter, dateFormatter) => {
		const creditAccountRef = getCreditAccountRef();
		if (!creditAccountRef) {
			targetDiv.textContent = 'Invoices unavailable (missing credit account id).';
			return;
		}

		targetDiv.textContent = 'Loading invoices...';
		const url = `https://us.merchantos.com/admin/invoicing/v1/credit-accounts/${encodeURIComponent(creditAccountRef)}/invoices?page=1&limit=20&sort=createdAt:desc`;

		try {
			const response = await fetch(url, { method: 'GET', credentials: 'include', headers: { Accept: 'application/json' } });
			if (!response.ok) throw new Error(`Invoices request failed: ${response.status}`);
			const data = await response.json();
			const invoices = Array.isArray(data?.data) ? data.data : [];
			renderInvoices(targetDiv, invoices, moneyFormatter, dateFormatter);
		} catch (err) {
			console.error('Failed to fetch invoices', err);
			targetDiv.textContent = `Failed to load invoices: ${err.message}`;
		}
	};

	const fetchCreditMemos = async (targetDiv, moneyFormatter, dateFormatter) => {
		const creditAccountRef = getCreditAccountRef();
		if (!creditAccountRef) {
			targetDiv.textContent = 'Credit memos unavailable (missing credit account id).';
			return;
		}

		targetDiv.textContent = 'Loading credit memos...';
		const url = `https://us.merchantos.com/admin/invoicing/v1/credit-accounts/${encodeURIComponent(creditAccountRef)}/credit-memos?page=1&limit=20`;

		try {
			const response = await fetch(url, { method: 'GET', credentials: 'include', headers: { Accept: 'application/json' } });
			if (!response.ok) throw new Error(`Credit memos request failed: ${response.status}`);
			const data = await response.json();
			const memos = Array.isArray(data?.data) ? data.data : [];
			renderCreditMemos(targetDiv, memos, moneyFormatter, dateFormatter);
		} catch (err) {
			console.error('Failed to fetch credit memos', err);
			targetDiv.textContent = `Failed to load credit memos: ${err.message}`;
		}
	};

	const renderInvoices = (targetDiv, invoices, moneyFormatter, dateFormatter) => {
		targetDiv.innerHTML = '<strong>Invoices</strong>';
		if (!invoices.length) {
			targetDiv.innerHTML += '<div>No invoices found.</div>';
			return;
		}

		const table = document.createElement('table');
		table.style.width = '100%';
		table.style.borderCollapse = 'collapse';

		const headerRow = document.createElement('tr');
		const columns = [
			{ key: 'invoiceNumber', label: 'Invoice #' },
			{ key: 'transactionRef', label: 'Transaction Ref', render: (val, _row, td) => {
				const saleId = extractSaleId(val);
				if (!saleId) {
					td.textContent = val ?? '';
					return;
				}
				const link = document.createElement('a');
				link.href = `https://us.merchantos.com/?name=transaction.views.transaction&form_name=view&id=${saleId}&tab=details`;
				link.textContent = val;
				link.target = '_blank';
				link.rel = 'noopener noreferrer';
				td.appendChild(link);
			} },
			{ key: 'total', label: 'Total', render: (val, _row, td) => { td.textContent = moneyFormatter(val); } },
			{ key: 'status', label: 'Status' },
			{ key: 'issueDate', label: 'Issue Date', render: (val, _row, td) => { td.textContent = dateFormatter(val); } },
			{ key: 'createdAt', label: 'Created At', render: (val, _row, td) => { td.textContent = dateFormatter(val); } },
			{ key: 'terms', label: 'Terms', render: (val, row, td) => {
				const terms = val || row?.terms;
				if (!terms) return;
				const parts = [];
				if (terms.dueDate) parts.push(`Due: ${dateFormatter(terms.dueDate)}`);
				if (terms.customerEmail) parts.push(`Email: ${terms.customerEmail}`);
				if (typeof terms.sendByEmail === 'boolean') parts.push(`Send by email: ${terms.sendByEmail}`);
				td.textContent = parts.join(' | ');
			} },
			{ key: 'proposalURL', label: 'Proposal', render: (val, _row, td) => {
				if (!val) return;
				const link = document.createElement('a');
				link.href = val;
				link.textContent = 'Open';
				link.target = '_blank';
				link.rel = 'noopener noreferrer';
				td.appendChild(link);
			} },
		];
		columns.forEach(({ label }) => {
			const th = document.createElement('th');
			th.textContent = label;
			th.style.border = '1px solid #ccc';
			th.style.padding = '4px 6px';
			th.style.textAlign = 'left';
			headerRow.appendChild(th);
		});
		table.appendChild(headerRow);

		invoices.forEach((inv) => {
			const tr = document.createElement('tr');
			columns.forEach(({ key, render }) => {
				const td = document.createElement('td');
				const raw = inv?.[key];
				if (render) {
					render(raw, inv, td);
				} else {
					td.textContent = raw ?? '';
				}
				td.style.border = '1px solid #eee';
				td.style.padding = '4px 6px';
				tr.appendChild(td);
			});
			table.appendChild(tr);
		});

		targetDiv.appendChild(table);
		const toggle = addTableToggle(table, 15);
		if (toggle) {
			const toggleWrap = document.createElement('div');
			toggleWrap.style.marginTop = '6px';
			toggleWrap.appendChild(toggle);
			targetDiv.appendChild(toggleWrap);
		}
	};

	const renderCreditMemos = (targetDiv, memos, moneyFormatter, dateFormatter) => {
		targetDiv.innerHTML = '<strong>Credit Memos</strong>';
		if (!memos.length) {
			targetDiv.innerHTML += '<div>No credit memos found.</div>';
			return;
		}

		const table = document.createElement('table');
		table.style.width = '100%';
		table.style.borderCollapse = 'collapse';

		const headerRow = document.createElement('tr');
		const columns = [
			{ key: 'creditMemoNumber', label: 'Credit Memo #' },
			{ key: 'type', label: 'Type' },
			{ key: 'amount', label: 'Amount', render: (val, _row, td) => { td.textContent = moneyFormatter(val); } },
			{ key: 'remainingAmount', label: 'Remaining', render: (val, _row, td) => { td.textContent = moneyFormatter(val); } },
			{ key: 'status', label: 'Status' },
			{ key: 'transactionRef', label: 'Transaction Ref', render: (val, _row, td) => {
				const saleId = extractSaleId(val);
				if (!saleId) {
					td.textContent = val ?? '';
					return;
				}
				const link = document.createElement('a');
				link.href = `https://us.merchantos.com/?name=transaction.views.transaction&form_name=view&id=${saleId}&tab=details`;
				link.textContent = val;
				link.target = '_blank';
				link.rel = 'noopener noreferrer';
				td.appendChild(link);
			} },
			{ key: 'createdAt', label: 'Created At', render: (val, _row, td) => { td.textContent = dateFormatter(val); } },
		];
		columns.forEach(({ label }) => {
			const th = document.createElement('th');
			th.textContent = label;
			th.style.border = '1px solid #ccc';
			th.style.padding = '4px 6px';
			th.style.textAlign = 'left';
			headerRow.appendChild(th);
		});
		table.appendChild(headerRow);

		memos.forEach((memo) => {
			const tr = document.createElement('tr');
			columns.forEach(({ key, render }) => {
				const td = document.createElement('td');
				const raw = memo?.[key];
				if (render) {
					render(raw, memo, td);
				} else {
					td.textContent = raw ?? '';
				}
				td.style.border = '1px solid #eee';
				td.style.padding = '4px 6px';
				tr.appendChild(td);
			});
			table.appendChild(tr);
		});

		targetDiv.appendChild(table);
		const toggle = addTableToggle(table, 15);
		if (toggle) {
			const toggleWrap = document.createElement('div');
			toggleWrap.style.marginTop = '6px';
			toggleWrap.appendChild(toggle);
			targetDiv.appendChild(toggleWrap);
		}
	};

	const fetchCreditActivity = async () => {
		const creditAccountId = window.customerCreditInfo?.creditAccoutnID ?? window.customerCreditInfo?.creditAccountID;
		const accountId = getAccountId();
		if (!creditAccountId || !accountId) {
			console.warn('Missing credit account or account id for activity fetch');
			return;
		}

		if (creditActivityLoading) return;
		creditActivityLoading = true;

		const targetUrl = `https://us.merchantos.com/API/Account/${accountId}/CreditAccount/${creditAccountId}.json?load_relations=all`;
		const container = document.getElementById('oldCreditsContent');
		if (container) container.textContent = 'Loading credit activity...';

		try {
			const response = await fetch(targetUrl, {
				method: 'GET',
				credentials: 'include',
				headers: {
					Accept: 'application/json',
				},
			});

			if (!response.ok) throw new Error(`Activity request failed: ${response.status}`);
			const data = await response.json();
			const paymentsRaw = data?.CreditAccount?.WithdrawalPayments?.SalePayment;
			const payments = Array.isArray(paymentsRaw) ? paymentsRaw : paymentsRaw ? [paymentsRaw] : [];

			window.latestCreditActivity = { raw: data, payments };
			renderCreditActivity(payments);
		} catch (error) {
			console.error('Failed to fetch credit activity', error);
			if (container) container.textContent = `Failed to load credit activity: ${error.message}`;
		} finally {
			creditActivityLoading = false;
		}
	};

	const showCreditTab = () => {
		const tabsMenu = document.getElementById('tabsMenu');
		const tabsContainer = document.querySelector('.tabs');
		const creditArticle = document.getElementById('tab-oldcredits-article');
		if (!tabsMenu || !tabsContainer || !creditArticle) return;

		tabsMenu.querySelectorAll('li').forEach((li) => li.classList.remove('current'));
		const creditTabLi = document.getElementById('menuOldCredits')?.parentElement;
		if (creditTabLi) creditTabLi.classList.add('current');

		tabsContainer.querySelectorAll('article.tab').forEach((article) => {
			article.classList.add('inactive');
			article.style.removeProperty('display');
		});

		const creditContent = document.getElementById('oldCreditsContent');
		if (creditContent) {
			creditContent.textContent = 'Loading credit activity...';
		}

		creditArticle.classList.remove('inactive');
		creditArticle.style.removeProperty('display');
		fetchCreditActivity();
	};

	const ensureCreditTab = () => {
		const tabsMenu = document.getElementById('tabsMenu');
		const tabsContainer = document.querySelector('.tabs');
		if (!tabsMenu || !tabsContainer) return;

		if (!tabsMenu.dataset.tmCleanupAttached) {
			tabsMenu.addEventListener('click', (e) => {
				const anchor = e.target.closest('a');
				if (!anchor || anchor.id === 'menuOldCredits') return;
				clearAllTabDisplays();
			});
			tabsMenu.dataset.tmCleanupAttached = 'true';
		}

		if (!document.getElementById('menuOldCredits')) {
			const li = document.createElement('li');
			li.className = 'oldcredits';
			const anchor = document.createElement('a');
			anchor.id = 'menuOldCredits';
			anchor.href = '#oldcredits';
			anchor.textContent = 'Old Credits';
			anchor.addEventListener('click', (e) => {
				e.preventDefault();
				showCreditTab();
			});
			li.appendChild(anchor);
			tabsMenu.appendChild(li);
		}

		if (!document.getElementById('tab-oldcredits-article')) {
			const article = document.createElement('article');
			article.className = 'view_tab_oldcredits tab loaded inactive';
			article.id = 'tab-oldcredits-article';
			const content = document.createElement('div');
			content.className = 'content';
			content.id = 'tab_oldcredits';
			const div = document.createElement('div');
			div.id = 'oldCreditsContent';
			div.textContent = 'Loading credit activity...';
			content.appendChild(div);
			article.appendChild(content);
			tabsContainer.appendChild(article);
		}
	};

	const injectButton = () => {
		if (document.getElementById('tm-fetch-customer')) return;
		const button = document.createElement('button');
		button.id = 'tm-fetch-customer';
		button.textContent = 'Fetch Customer';
		Object.assign(button.style, {
			position: 'absolute',
			top: '12px',
			right: '12px',
			padding: '8px 12px',
			zIndex: '9999',
			cursor: 'pointer',
		});
		button.addEventListener('click', fetchCustomer);
		document.body.appendChild(button);
	};

	const init = () => {
		injectButton();
	};

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}
})();
