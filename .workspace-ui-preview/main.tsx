import React from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {ProjectsPage} from '../src/features/projects/pages/ProjectsPage';
import {CreditUdhaarPage} from '../src/features/udhaar/pages/CreditUdhaarPage';
import './preview.css';
import '../src/styles/workspace-redesign.css';
import '../src/styles/workspace-ui.css';
import '../src/styles/charts.css';
const params=new URLSearchParams(window.location.search);
if(params.get('theme')==='dark') document.documentElement.classList.add('dark');
createRoot(document.getElementById('root')!).render(<MemoryRouter><div className="app-main" style={{padding:24,margin:0,width:'100%'}}>{params.get('page')==='udhaar'?<CreditUdhaarPage/>:<ProjectsPage/>}</div></MemoryRouter>);

